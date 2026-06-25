import { Svg, Path, Rect, Line, Circle, type Element } from "@matthewp/zebra";

// SVG icons built structurally so they hydrate cleanly (RawHTML is not
// supported by Zebra hydrate()).

function svg(size: number, ...children: Element[]): Svg {
  return new Svg()
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("width", String(size))
    .setAttribute("height", String(size))
    .setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "none")
    .setAttribute("stroke", "currentColor")
    .setAttribute("stroke-width", "2")
    .setAttribute("stroke-linecap", "round")
    .setAttribute("stroke-linejoin", "round")
    .append(...children);
}

const bookShape = (): Element[] => [
  new Path().setAttribute("d", "M4 19.5A2.5 2.5 0 0 1 6.5 17H20"),
  new Path().setAttribute("d", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"),
];

export const libraryIcon = (): Svg => svg(18, ...bookShape());

export const devicesIcon = (): Svg =>
  svg(
    18,
    new Rect().setAttribute("x", "4").setAttribute("y", "2").setAttribute("width", "16").setAttribute("height", "20").setAttribute("rx", "2"),
    new Line().setAttribute("x1", "12").setAttribute("y1", "18").setAttribute("x2", "12.01").setAttribute("y2", "18"),
  );

export const settingsIcon = (): Svg =>
  svg(
    18,
    new Circle().setAttribute("cx", "12").setAttribute("cy", "12").setAttribute("r", "3"),
    new Path().setAttribute("d", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"),
  );

export const sunIcon = (): Svg =>
  svg(
    18,
    new Circle().setAttribute("cx", "12").setAttribute("cy", "12").setAttribute("r", "5"),
    new Line().setAttribute("x1", "12").setAttribute("y1", "1").setAttribute("x2", "12").setAttribute("y2", "3"),
    new Line().setAttribute("x1", "12").setAttribute("y1", "21").setAttribute("x2", "12").setAttribute("y2", "23"),
    new Line().setAttribute("x1", "4.22").setAttribute("y1", "4.22").setAttribute("x2", "5.64").setAttribute("y2", "5.64"),
    new Line().setAttribute("x1", "18.36").setAttribute("y1", "18.36").setAttribute("x2", "19.78").setAttribute("y2", "19.78"),
    new Line().setAttribute("x1", "1").setAttribute("y1", "12").setAttribute("x2", "3").setAttribute("y2", "12"),
    new Line().setAttribute("x1", "21").setAttribute("y1", "12").setAttribute("x2", "23").setAttribute("y2", "12"),
    new Line().setAttribute("x1", "4.22").setAttribute("y1", "19.78").setAttribute("x2", "5.64").setAttribute("y2", "18.36"),
    new Line().setAttribute("x1", "18.36").setAttribute("y1", "5.64").setAttribute("x2", "19.78").setAttribute("y2", "4.22"),
  ).addClass("theme-icon theme-icon-sun");

export const moonIcon = (): Svg =>
  svg(
    18,
    new Path().setAttribute("d", "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"),
  ).addClass("theme-icon theme-icon-moon");

export const searchIcon = (): Svg =>
  svg(
    14,
    new Circle().setAttribute("cx", "11").setAttribute("cy", "11").setAttribute("r", "8"),
    new Line().setAttribute("x1", "21").setAttribute("y1", "21").setAttribute("x2", "16.65").setAttribute("y2", "16.65"),
  )
    .setAttribute("stroke-width", "2.5")
    .addClass("search-icon");

export const userBookIcon = (): Svg =>
  svg(28, ...bookShape()).addClass("user-book-icon");

export const gridIcon = (): Svg =>
  new Svg()
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("width", "20")
    .setAttribute("height", "20")
    .setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "currentColor")
    .setAttribute("stroke", "none")
    .addClass("grid-icon")
    .append(
      new Rect().addClass("grid-tl").setAttribute("x", "3").setAttribute("y", "3").setAttribute("width", "8").setAttribute("height", "8").setAttribute("rx", "2"),
      new Rect().addClass("grid-tr").setAttribute("x", "13").setAttribute("y", "3").setAttribute("width", "8").setAttribute("height", "8").setAttribute("rx", "2"),
      new Rect().addClass("grid-bl").setAttribute("x", "3").setAttribute("y", "13").setAttribute("width", "8").setAttribute("height", "8").setAttribute("rx", "2"),
      new Rect().addClass("grid-br").setAttribute("x", "13").setAttribute("y", "13").setAttribute("width", "8").setAttribute("height", "8").setAttribute("rx", "2"),
    );
