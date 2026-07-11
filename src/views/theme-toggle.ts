import { View, Button, Span, signal, computed } from "@matthewp/zebra";
import { theme } from "./prefs.ts";
import { sunIcon, moonIcon } from "./icons.ts";

// Sidebar control that flips the app-wide color theme. Shows the icon and
// label of the theme it will switch *to*: a sun ("Light mode") while dark,
// a moon ("Dark mode") while light.
export class ThemeToggle extends View {
  // SSR has no access to localStorage, so it always renders as if the theme
  // were "dark" (see prefs.ts's readInitialTheme) — start this signal at the
  // same default so the client's first render matches the SSR'd markup.
  // hydrate() then corrects it to the real value, which flows through the
  // bindings below like any other update.
  private isDark = signal(true);

  render() {
    const isDark = this.isDark;

    const sun = sunIcon().toggleVisible(isDark);
    const moon = moonIcon().toggleVisible(() => !isDark());
    const label = new Span().setText(computed(() => (isDark() ? "Light mode" : "Dark mode")));

    return new Button()
      .addClass("sidebar__item sidebar__item--button")
      .setAttribute("type", "button")
      .setAttribute("aria-label", "Toggle color theme")
      .on("click", () => {
        const next = !isDark();
        isDark(next);
        theme(next ? "dark" : "light");
      })
      .append(sun, moon, label);
  }

  hydrate(el: HTMLElement): this {
    super.hydrate(el);
    this.isDark(theme() === "dark");
    return this;
  }
}
