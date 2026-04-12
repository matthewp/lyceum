import { test } from "node:test";
import assert from "node:assert/strict";
import { bookFilename } from "../src/book-filename.ts";

test("single author", () => {
  assert.equal(bookFilename("Dune", ["Frank Herbert"], "epub"), "Dune - Frank Herbert.epub");
});

test("multiple authors joined with &", () => {
  assert.equal(
    bookFilename("Good Omens", ["Terry Pratchett", "Neil Gaiman"], "epub"),
    "Good Omens - Terry Pratchett & Neil Gaiman.epub"
  );
});

test("no authors omits the dash", () => {
  assert.equal(bookFilename("Unknown Book", [], "pdf"), "Unknown Book.pdf");
});

test("format is lowercased", () => {
  assert.equal(bookFilename("Dune", ["Frank Herbert"], "EPUB"), "Dune - Frank Herbert.epub");
  assert.equal(bookFilename("Dune", ["Frank Herbert"], "PDF"), "Dune - Frank Herbert.pdf");
  assert.equal(bookFilename("Dune", ["Frank Herbert"], "MOBI"), "Dune - Frank Herbert.mobi");
});

test("special chars in title are replaced with underscore", () => {
  assert.equal(
    bookFilename('Title: A "Story"', ["Author"], "epub"),
    "Title_ A _Story_ - Author.epub"
  );
});

test("special chars in author are replaced with underscore", () => {
  assert.equal(
    bookFilename("Title", ["Author/Name"], "epub"),
    "Title - Author_Name.epub"
  );
});

test("all illegal filesystem chars are replaced", () => {
  // Characters: : < > ? * " | \ /
  assert.equal(
    bookFilename('A:B<C>D?E*F"G|H', ["X\\Y/Z"], "epub"),
    "A_B_C_D_E_F_G_H - X_Y_Z.epub"
  );
});
