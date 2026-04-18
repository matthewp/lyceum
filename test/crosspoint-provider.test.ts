import { test } from "node:test";
import assert from "node:assert/strict";
import { CrossPointProvider, sendViaWebSocket } from "../src/devices/crosspoint.ts";

// --- startAuth tests ---

test("startAuth with manual IP stores pending device and returns confirmation", async () => {
  const provider = new CrossPointProvider();
  const result = await provider.startAuth({ ip: "192.168.1.100", port: "81" });
  assert.ok(result.message.includes("192.168.1.100:81"));
  assert.deepEqual(result.devices, [{ ip: "192.168.1.100", port: 81 }]);
});

test("startAuth with manual IP uses default port 81 when port omitted", async () => {
  const provider = new CrossPointProvider();
  const result = await provider.startAuth({ ip: "10.0.0.5" });
  assert.ok(result.message.includes("10.0.0.5:81"));
});

// --- completeAuth tests ---

test("completeAuth with valid selection returns DeviceInfo with ip and port credentials", async () => {
  const provider = new CrossPointProvider();
  await provider.startAuth({ ip: "192.168.1.42", port: "81" });
  const info = await provider.completeAuth({ selection: "1" });
  assert.equal(info.type, "crosspoint");
  assert.equal(info.credentials.ip, "192.168.1.42");
  assert.equal(info.credentials.port, "81");
});

test("completeAuth defaults to selection 1 when omitted", async () => {
  const provider = new CrossPointProvider();
  await provider.startAuth({ ip: "192.168.1.55", port: "9000" });
  const info = await provider.completeAuth({});
  assert.equal(info.credentials.ip, "192.168.1.55");
  assert.equal(info.credentials.port, "9000");
});

test("completeAuth clears pending state after use", async () => {
  const provider = new CrossPointProvider();
  await provider.startAuth({ ip: "192.168.1.1", port: "81" });
  await provider.completeAuth({ selection: "1" });
  await assert.rejects(
    () => provider.completeAuth({ selection: "1" }),
    /No pending CrossPoint discovery/,
  );
});

test("completeAuth throws when no pending discovery", async () => {
  const provider = new CrossPointProvider();
  await assert.rejects(
    () => provider.completeAuth({ selection: "1" }),
    /No pending CrossPoint discovery/,
  );
});

test("completeAuth throws on out-of-range selection", async () => {
  const provider = new CrossPointProvider();
  await provider.startAuth({ ip: "192.168.1.1", port: "81" });
  await assert.rejects(
    () => provider.completeAuth({ selection: "5" }),
    /Invalid selection/,
  );
});

test("completeAuth throws on selection 0", async () => {
  const provider = new CrossPointProvider();
  await provider.startAuth({ ip: "192.168.1.1", port: "81" });
  await assert.rejects(
    () => provider.completeAuth({ selection: "0" }),
    /Invalid selection/,
  );
});

// --- sendViaWebSocket tests ---

// Mock WebSocket that simulates a CrossPoint device
class MockWebSocket extends EventTarget {
  static instances: MockWebSocket[] = [];
  url: string;
  sentMessages: Array<string | Uint8Array> = [];
  private _deviceBehavior: "success" | "error" | "close";

  constructor(url: string, behavior: "success" | "error" | "close" = "success") {
    super();
    this.url = url;
    this._deviceBehavior = behavior;
    MockWebSocket.instances.push(this);
    // Simulate async connection
    setImmediate(() => this._connect());
  }

  private _connect() {
    this.dispatchEvent(new Event("open"));
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof data === "string") {
      this.sentMessages.push(data);
      if (data.startsWith("START:")) {
        if (this._deviceBehavior === "error") {
          setImmediate(() => {
            const msg = new MessageEvent("message", { data: "ERROR:disk full" });
            this.dispatchEvent(msg);
          });
        } else {
          setImmediate(() => {
            const msg = new MessageEvent("message", { data: "READY" });
            this.dispatchEvent(msg);
          });
        }
      }
    } else {
      // Binary chunk — after receiving all chunks, device sends DONE
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      this.sentMessages.push(bytes);
      if (this._deviceBehavior === "success") {
        setImmediate(() => {
          const msg = new MessageEvent("message", { data: "DONE" });
          this.dispatchEvent(msg);
        });
      }
    }
  }

  close() {
    setImmediate(() => {
      this.dispatchEvent(new CloseEvent("close"));
    });
  }
}

// Helper to install/restore a mock WebSocket globally
function withMockWebSocket(
  behavior: "success" | "error" | "close",
  fn: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    const original = (globalThis as any).WebSocket;
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) { super(url, behavior); }
    };
    try {
      await fn();
    } finally {
      (globalThis as any).WebSocket = original;
    }
  };
}

test("sendViaWebSocket sends START frame and file chunks then resolves on DONE",
  withMockWebSocket("success", async () => {
    const file = Buffer.from("hello world epub content");
    await sendViaWebSocket("192.168.1.1", 81, "book.epub", file);

    const ws = MockWebSocket.instances[0];
    assert.ok(ws, "WebSocket was created");
    const startFrame = ws.sentMessages.find(m => typeof m === "string" && m.startsWith("START:"));
    assert.ok(startFrame, "START frame sent");
    assert.equal(startFrame, `START:book.epub:${file.length}:/`);
    // At least one binary chunk sent
    const binaryFrames = ws.sentMessages.filter(m => typeof m !== "string");
    assert.ok(binaryFrames.length > 0, "Binary chunks sent");
  }),
);

test("sendViaWebSocket rejects on device ERROR response",
  withMockWebSocket("error", async () => {
    const file = Buffer.from("epub data");
    await assert.rejects(
      () => sendViaWebSocket("192.168.1.1", 81, "book.epub", file),
      /disk full/,
    );
  }),
);

test("sendViaWebSocket connects to correct URL",
  withMockWebSocket("success", async () => {
    const file = Buffer.from("x");
    await sendViaWebSocket("10.0.0.42", 9000, "test.epub", file);
    const ws = MockWebSocket.instances[0];
    assert.equal(ws.url, "ws://10.0.0.42:9000/");
  }),
);
