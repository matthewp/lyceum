import { View, Button, Span, computed } from "@matthewp/zebra";
import { theme } from "./prefs.ts";
import { sunIcon, moonIcon } from "./icons.ts";

// Sidebar control that flips the app-wide color theme. Shows the icon and
// label of the theme it will switch *to*: a sun ("Light mode") while dark,
// a moon ("Dark mode") while light.
export class ThemeToggle extends View {
  render() {
    const isDark = computed(() => theme() === "dark");

    const sun = sunIcon().toggleVisible(isDark);
    const moon = moonIcon().toggleVisible(() => !isDark());
    const label = new Span().setText(computed(() => (isDark() ? "Light mode" : "Dark mode")));

    return new Button()
      .addClass("sidebar-item sidebar-theme-toggle")
      .setAttribute("type", "button")
      .setAttribute("aria-label", "Toggle color theme")
      .on("click", () => theme(isDark() ? "light" : "dark"))
      .append(sun, moon, label);
  }
}
