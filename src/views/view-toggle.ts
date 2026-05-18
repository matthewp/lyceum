import { View, Div, Button } from "@matthewp/zebra";
import { viewMode, type ViewMode } from "./prefs.ts";

export class ViewToggle extends View {
  render() {
    return new Div().addClass("view-toggle").append(
      this.btn("grid", "Grid"),
      this.btn("table", "Table"),
    );
  }

  private btn(mode: ViewMode, label: string) {
    return new Button()
      .addClass("view-btn")
      .toggleClass("active", () => viewMode() === mode)
      .setAttribute("data-view", mode)
      .on("click", () => viewMode(mode))
      .append(label);
  }
}
