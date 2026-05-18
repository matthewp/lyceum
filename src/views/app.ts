import {
  View,
  Div,
  Button,
  Footer,
  Element,
  DocumentElement,
  signal,
  computed,
  effect,
} from "@matthewp/zebra";
import { AppHeader } from "./header.ts";
import { Sidebar } from "./sidebar.ts";
import { gridIcon } from "./icons.ts";
import { ALL_PAGE_CLASSES, type NavSection, type PageClass } from "../routes.ts";

const isBrowser = typeof document !== "undefined";

function readDataset(key: string): string | undefined {
  return isBrowser ? document.documentElement.dataset[key] : undefined;
}

/**
 * Top-level layout. SSR-rendered once, then hydrated. After hydrate, the
 * router calls setPage() to swap the inner page View on navigation.
 */
export class App extends View {
  // Global UI state, persisted to localStorage and mirrored onto <html>
  // so blocking-script set values survive (and so CSS can target either).
  readonly sidebarOpen = signal(readDataset("sidebar") === "open");
  readonly activeNav = signal<NavSection>(null);
  readonly pageClass = signal<PageClass>("");

  private header = new AppHeader();
  private sidebar = new Sidebar(() => this.activeNav());
  private pageContainer = new Div().setAttribute("id", "page-content");

  // Holds the current top-level page View. Owned outside render() so we
  // can swap it imperatively post-hydrate.
  private currentPage: View;

  constructor(initial: { page: View; nav: NavSection; pageClass: PageClass }) {
    super();
    this.currentPage = initial.page;
    this.activeNav(initial.nav);
    this.pageClass(initial.pageClass);
  }

  render() {
    const sidebarAttr = computed(() => (this.sidebarOpen() ? "open" : "closed"));

    new DocumentElement()
      .setData("sidebar", sidebarAttr)
      .setData("page", this.pageClass);

    if (isBrowser) {
      effect(() => {
        try {
          localStorage.setItem("sidebar", sidebarAttr());
        } catch { /* localStorage unavailable */ }
      });
    }

    this.pageContainer.append(this.currentPage);

    const root = new Div().setAttribute("id", "app-root");
    for (const c of ALL_PAGE_CLASSES) {
      root.toggleClass(c, computed(() => this.pageClass() === c));
    }

    return root.append(
      this.header,
      this.sidebar,
      new Div().addClass("sidebar-overlay")
        .setAttribute("id", "sidebar-overlay")
        .on("click", () => this.sidebarOpen(false)),
      new Div().addClass("main-wrap").append(
        new Button()
          .addClass("sidebar-toggle")
          .setAttribute("id", "sidebar-toggle")
          .setAttribute("aria-label", "Toggle sidebar")
          .on("click", () => this.sidebarOpen(!this.sidebarOpen()))
          .append(gridIcon()),
        this.pageContainer,
        new Footer().addClass("app-footer") as Element,
      ),
    );
  }

  /**
   * Replace the current page View. Called by the router after a navigation
   * has loaded data and dynamically imported the page module.
   */
  setPage(next: { page: View; nav: NavSection; pageClass: PageClass }): void {
    this.currentPage = next.page;
    this.activeNav(next.nav);
    this.pageClass(next.pageClass);
    this.pageContainer.clear().append(next.page);
  }
}
