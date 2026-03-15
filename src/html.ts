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

interface UnsafeHTML {
  dangerouslySetInnerHTML: string;
}

export function unsafeHTML(s: string): UnsafeHTML {
  return { dangerouslySetInnerHTML: s };
}

function isUnsafeHTML(value: unknown): value is UnsafeHTML {
  return (
    value !== null &&
    typeof value === "object" &&
    "dangerouslySetInnerHTML" in (value as Record<string, unknown>)
  );
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (isUnsafeHTML(val)) {
      result += val.dangerouslySetInnerHTML;
    } else {
      result += escapeHtml(String(val));
    }
    result += strings[i + 1];
  }
  return result;
}
