import AdmZip from "adm-zip";
import { parseStringPromise, Builder } from "xml2js";
import { posix, dirname } from "node:path";
import { logger as root } from "./logger.ts";

const log = root.child({ module: "epub-inject" });

export interface EpubInjectMetadata {
  title: string;
  authors: string[];
  cover: Buffer | null;
}

export async function injectEpubMetadata(
  epubBytes: Buffer,
  meta: EpubInjectMetadata
): Promise<Buffer> {
  try {
    const zip = new AdmZip(epubBytes);

    // Step 1: Find the OPF path via META-INF/container.xml
    const containerEntry = zip.getEntry("META-INF/container.xml");
    if (!containerEntry) throw new Error("Missing META-INF/container.xml");
    const containerDoc = await parseStringPromise(containerEntry.getData().toString("utf-8")) as any;
    const opfPath: string = containerDoc?.container?.rootfiles?.[0]?.rootfile?.[0]?.["$"]?.["full-path"];
    if (!opfPath) throw new Error("Could not find OPF path in container.xml");

    // Step 2: Parse the OPF
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) throw new Error(`OPF not found at ${opfPath}`);
    const opfDoc = await parseStringPromise(opfEntry.getData().toString("utf-8")) as any;
    const pkg = opfDoc?.package;
    if (!pkg) throw new Error("Invalid OPF: missing <package>");
    const metadata = pkg.metadata?.[0];
    if (!metadata) throw new Error("Invalid OPF: missing <metadata>");

    // Step 3: Inject title
    metadata["dc:title"] = [meta.title];

    // Step 4: Inject authors — replace all existing dc:creator entries
    if (meta.authors.length > 0) {
      metadata["dc:creator"] = meta.authors.map(name => ({
        _: name,
        $: { "opf:role": "aut" },
      }));
    } else {
      delete metadata["dc:creator"];
    }

    // Step 5: Inject cover if provided
    if (meta.cover) {
      const opfDir = dirname(opfPath);
      const coverHref = "images/lyceum-cover.jpg";
      const coverZipPath = opfDir === "." ? coverHref : posix.join(opfDir, coverHref);
      const coverId = "lyceum-injected-cover";

      // Find existing cover in manifest (OPF2: <meta name="cover">, OPF3: properties="cover-image")
      const manifest = pkg.manifest?.[0];
      const items: any[] = manifest?.item ?? [];

      const existingMetaCover = (metadata.meta ?? []).find(
        (m: any) => m?.["$"]?.name === "cover"
      );
      const existingCoverIdFromMeta: string | undefined = existingMetaCover?.["$"]?.content;

      const existingCoverItemOpf3 = items.find(
        (i: any) => (i?.["$"]?.properties ?? "").split(" ").includes("cover-image")
      );
      const existingCoverItem =
        existingCoverIdFromMeta
          ? items.find((i: any) => i?.["$"]?.id === existingCoverIdFromMeta)
          : existingCoverItemOpf3;

      // Remove old cover file from zip if it exists and is different from our stable path
      if (existingCoverItem) {
        const existingHref: string | undefined = existingCoverItem?.["$"]?.href;
        if (existingHref) {
          const existingZipPath = opfDir === "." ? existingHref : posix.join(opfDir, existingHref);
          if (existingZipPath !== coverZipPath && zip.getEntry(existingZipPath)) {
            zip.deleteFile(existingZipPath);
          }
        }
      }

      // Write new cover into zip
      zip.addFile(coverZipPath, meta.cover);

      // Update or add manifest item
      const targetItem = items.find((i: any) => i?.["$"]?.id === coverId) ?? existingCoverItem;
      if (targetItem) {
        targetItem["$"]["href"] = coverHref;
        targetItem["$"]["id"] = coverId;
        targetItem["$"]["media-type"] = "image/jpeg";
        // Remove OPF3 property if present to avoid confusion
        delete targetItem["$"]["properties"];
      } else {
        items.push({ $: { id: coverId, href: coverHref, "media-type": "image/jpeg" } });
        if (!pkg.manifest) pkg.manifest = [{ item: items }];
        else pkg.manifest[0].item = items;
      }

      // Update or add OPF2 <meta name="cover">
      if (existingMetaCover) {
        existingMetaCover["$"]["content"] = coverId;
      } else {
        metadata.meta = [...(metadata.meta ?? []), { $: { name: "cover", content: coverId } }];
      }
    }

    // Step 6: Serialize updated OPF back to XML and update zip entry
    const builder = new Builder({
      renderOpts: { pretty: false },
    });
    const newOpfXml = builder.buildObject(opfDoc);
    zip.updateFile(opfPath, Buffer.from(newOpfXml, "utf-8"));

    return zip.toBuffer();
  } catch (err) {
    log.warn({ err }, "epub metadata injection failed, serving raw bytes");
    return epubBytes;
  }
}
