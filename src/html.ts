const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESC[ch]);
}

export class SafeHTML {
  #html: string;
  constructor(value: string) {
    this.#html = value;
  }
  toString(): string {
    return this.#html;
  }
}

export class UnsafeHTML {
  #html: string;
  constructor(value: string) {
    this.#html = value;
  }
  toString(): string {
    return this.#html;
  }
}

export function unsafeHTML(s: string): UnsafeHTML {
  return new UnsafeHTML(s);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHTML {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val instanceof SafeHTML || val instanceof UnsafeHTML) {
      result += val.toString();
    } else {
      result += escapeHtml(String(val));
    }
    result += strings[i + 1];
  }
  return new SafeHTML(result);
}

export function renderToString(safe: SafeHTML): string {
  return safe.toString();
}
