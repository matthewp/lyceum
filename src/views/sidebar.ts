import { View, Aside, Nav, Anchor, computed } from "@matthewp/zebra";
import { libraryIcon, devicesIcon, settingsIcon } from "./icons.ts";
import { ThemeToggle } from "./theme-toggle.ts";
import type { NavSection } from "../routes.ts";

export class Sidebar extends View {
  private activeNav: () => NavSection;
  private themeToggle = new ThemeToggle();

  constructor(activeNav: () => NavSection) {
    super();
    this.activeNav = activeNav;
  }

  render() {
    return new Aside().addClass("sidebar").setAttribute("id", "sidebar").append(
      new Nav().addClass("sidebar__nav").append(
        this.item("/app", "library", libraryIcon(), "Library"),
        this.item("/app/devices", "devices", devicesIcon(), "Devices"),
        this.item("/app/settings", "settings", settingsIcon(), "Settings"),
        this.themeToggle,
      ),
    );
  }

  private item(href: string, section: NavSection, icon: ReturnType<typeof libraryIcon>, label: string) {
    const isActive = computed(() => this.activeNav() === section);
    return new Anchor()
      .setAttribute("href", href)
      .addClass("sidebar__item")
      .toggleClass("sidebar__item--active", isActive)
      .append(icon, label);
  }
}
