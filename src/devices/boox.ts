import crypto from "node:crypto";
import OSS from "ali-oss";
import { logger as root } from "../logger.ts";
import type { DeviceProvider, DeviceInfo } from "./index.ts";

const log = root.child({ module: "boox" });

const API_HOSTS = new Map([
  ["us", "https://push.boox.com"],
  ["eu", "https://eur.boox.com"],
  ["cn", "https://send2boox.com"],
]);

function apiHost(region: string): string {
  const host = API_HOSTS.get(region);
  if (!host) throw new Error(`Unknown Boox region: ${region}. Supported: ${[...API_HOSTS.keys()].join(", ")}`);
  return host;
}

function md5(data: string | Buffer): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

async function booxFetch(
  host: string,
  path: string,
  opts: RequestInit = {},
  token?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${host}${path}`;

  let res: Response;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (e: any) {
    log.error({ method: opts.method ?? "GET", path, err: e }, "Fetch failed");
    throw new Error(`Boox request failed: ${e.message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    log.error({ method: opts.method ?? "GET", path, status: res.status }, "Request failed");
    throw new Error(`Boox API error (${res.status}): ${body}`);
  }
  return res.json();
}

export class BooxProvider implements DeviceProvider {
  async startAuth(params: Record<string, string>): Promise<{ message: string }> {
    const email = params.email;
    if (!email) throw new Error("email is required");
    const region = params.region ?? "eu";
    const host = apiHost(region);

    await booxFetch(host, "/api/1/users/sendMobileCode", {
      method: "POST",
      body: JSON.stringify({ mobi: email }),
    });

    return { message: `Verification code sent to ${email}. Use verify_device with the code.` };
  }

  async completeAuth(params: Record<string, string>): Promise<DeviceInfo> {
    const email = params.email;
    const code = params.code;
    if (!email || !code) throw new Error("email and code are required");
    const region = params.region ?? "eu";
    const host = apiHost(region);

    const result = await booxFetch(host, "/api/1/users/signupByPhoneOrEmail", {
      method: "POST",
      body: JSON.stringify({ mobi: email, code }),
    });

    const token = result?.data?.token;
    if (!token) throw new Error("No token returned from Boox auth");

    // Get the MongoDB uid from /users/me (the JWT only has the numeric id)
    const meResult = await booxFetch(host, "/api/1/users/me", {}, token);
    const uid = meResult?.data?.uid;
    if (!uid) throw new Error("No uid found in user profile");

    return {
      id: "",
      name: "",
      type: "boox",
      credentials: { token, uid, email, region },
    };
  }

  async sendFile(device: DeviceInfo, file: Buffer, filename: string): Promise<void> {
    const { token, uid, region } = device.credentials;
    const host = apiHost(region);

    // Step 1: Get STS credentials, bucket info, and sync session in parallel
    const [stsResult, bucketsResult, syncResult] = await Promise.all([
      booxFetch(host, "/api/1/config/stss", {}, token),
      booxFetch(host, "/api/1/config/buckets", {}, token),
      booxFetch(host, "/api/1/users/syncToken", {}, token),
    ]);

    const sts = stsResult?.data;
    if (!sts?.AccessKeyId || !sts?.AccessKeySecret || !sts?.SecurityToken) {
      throw new Error("Failed to get OSS credentials");
    }

    const cloudBucket = bucketsResult?.data?.["onyx-cloud"];
    if (!cloudBucket?.bucket || !cloudBucket?.region) {
      throw new Error("Failed to get onyx-cloud bucket info");
    }

    const syncSession = syncResult?.data;
    if (!syncSession?.session_id || !syncSession?.cookie_name) {
      throw new Error("Failed to get Sync Gateway session");
    }

    // Step 2: Upload to Alibaba OSS (multipart)
    const ext = filename.split(".").pop() ?? "epub";
    const fileHash = md5(file);
    const objectKey = `${uid}/push/${fileHash}.${ext}`;

    const ossClient = new OSS({
      accessKeyId: sts.AccessKeyId,
      accessKeySecret: sts.AccessKeySecret,
      stsToken: sts.SecurityToken,
      region: cloudBucket.region,
      bucket: cloudBucket.bucket,
    });

    log.info({ bytes: file.length }, "Uploading to OSS");
    await ossClient.multipartUpload(objectKey, file, {
      headers: { "Content-Type": `application/${ext === "epub" ? "epub+zip" : ext}` },
    });

    // Generate signed URL for device download
    const signedUrl = ossClient.signatureUrl(objectKey, {
      expires: 10000,
      response: { "content-disposition": "attachment" },
    });

    // Step 3: Push via Couchbase Sync Gateway _bulk_docs
    const now = Date.now();
    const docId = crypto.randomUUID().replace(/-/g, "");

    const content = JSON.stringify({
      _id: docId,
      createdAt: now,
      distributeChannel: "onyx",
      formats: [ext],
      guid: docId,
      name: filename,
      ownerId: uid,
      size: file.length,
      md5: "",
      storage: {
        [ext]: {
          oss: {
            displayName: filename,
            expires: 0,
            key: objectKey,
            provider: "oss",
            size: file.length,
            url: signedUrl,
          },
        },
      },
      title: filename,
      updatedAt: now,
    });

    const revHash = md5(content);
    const rev = `1-${revHash}`;

    log.info("Syncing to device");
    const bulkRes = await fetch(`${host}/neocloud/_bulk_docs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${syncSession.cookie_name}=${syncSession.session_id}`,
      },
      body: JSON.stringify({
        docs: [{
          contentType: "digital_content",
          content,
          msgType: 2,
          dbId: `${uid}-MESSAGE`,
          user: uid,
          name: filename,
          size: file.length,
          uniqueId: docId,
          createdAt: now,
          updatedAt: now,
          _id: docId,
          _rev: rev,
          _revisions: { start: 1, ids: [revHash] },
        }],
        new_edits: false,
      }),
    });

    if (!bulkRes.ok) {
      const body = await bulkRes.text();
      log.error({ status: bulkRes.status }, "Sync Gateway _bulk_docs failed");
      throw new Error(`Sync Gateway _bulk_docs failed (${bulkRes.status}): ${body}`);
    }

    // Step 4: Register with Boox via saveAndPush
    await booxFetch(host, "/api/1/push/saveAndPush", {
      method: "POST",
      body: JSON.stringify({
        data: {
          bucket: "onyx-cloud",
          name: filename,
          parent: null,
          resourceDisplayName: filename,
          resourceKey: objectKey,
          resourceType: ext,
          title: filename,
        },
        cbMsg: { id: docId, rev },
      }),
    }, token);
    log.info("Send complete");
  }
}
