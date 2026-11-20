# My Library

Every book you've read on Goodreads, shelved in a vintage bookcase.

**Live site:** https://ramyani-ghosh.github.io/my-library/

It's a static site (plain HTML, CSS and JavaScript, no build step), so it runs on GitHub Pages as is.

## Getting your books in

Goodreads retired its RSS feeds in November 2026, and shelf pages now require signing in, so a website can't fetch someone's books from a username alone. My Library uses Goodreads' own library export instead:

1. On Goodreads, go to **My Books → Import and export** (https://www.goodreads.com/review/import).
2. Click **Export Library** and download `goodreads_library_export.csv`.
3. Drop the file onto My Library.

Only books on the **read** shelf are shown. The file is read in the browser and never uploaded anywhere. The library is remembered in that browser until you click "Load a different library".

### Show your own shelf to everyone

Rename your export to `library.csv` and put it next to `index.html`. Anyone who opens the site will then see your bookcase straight away, and visitors can still load their own export.

This repo already includes one. **Publishing it makes the whole file public**, reviews and private notes included, so check it before pushing to a public repository.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `styles.css` | Bookcase, wood, lighting and spine styling |
| `app.js` | CSV reading, spine design, and shelf packing |
| `library.csv` | The library shown by default (a Goodreads export) |
| `sample-library.csv` | A made-up library in Goodreads export format, for the "browse a sample library" link |

## Updating the site

GitHub Pages lets browsers cache files for 10 minutes. `index.html` loads `styles.css?v=N` and `app.js?v=N`: bump `N` whenever either file changes, so visitors get the new version straight away instead of a stale (or mismatched) copy.

## Run it locally

Browsers block reading the sample file when the page is opened straight from disk, so serve the folder:

```bash
python3 -m http.server 8737
```

Then open http://localhost:8737.

## Put it on GitHub Pages

1. Create a new public repository on GitHub, for example `my-library`.
2. Upload these files to it (or `git push` them).
3. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-github-username>.github.io/my-library/`.

## Look and feel

- **Intro:** "my LIBRARY" fills the dark screen, then glides up into the header while candles light the bookcase. Click or press a key to skip it; it's off for visitors who prefer reduced motion.
- **Type and colour:** Yellowtail script in copper, Josefin Sans capitals in sage, Sorts Mill Goudy for body text, and notched outline buttons.
- **Textures:** Wood grain, leather, book cloth, paper and wear are generated in the browser from SVG noise (see the Textures section of `app.js`), so there are no image files to host.
- **Lighting:** Brass candle sconces sit on the columns. Each book is lit according to its distance from the nearest candles, and its highlight is on the side facing the flame.

## How the spines work

Each book gets a stable "random" look from its Goodreads ID: cloth or leather colour, gilt bands or raised ribs, an occasional title label, a font, and a height. The spine is then made exactly wide enough for its title: the title is measured, wrapped onto one to three lines, and shrunk only if it has to be. Series tags like "(Harry Potter, #1)" and long subtitles are dropped from the spine. The full title shows on hover.

## Header

When the full header scrolls out of view, a slim bar pins itself to the top: the small logo plus round icon buttons for Sort, Share library and New library. Scroll back to the top and the full header returns.

## Sorting

**Sort** (top right) shows the current order, for example "Date read · Newest first". Click it for a menu: choose date read, title, author, year published or rating, then the order (A to Z, newest first, and so on). The menu works with the keyboard too: arrow keys to move, Enter to choose, Esc to close. The books lift off the shelves and fly to their new places, and the choice is remembered in that browser.

## Whose library: the plaque

A cast plaque on the top of the bookcase names the library, for example "Ramyani’s Library": black hammered face, raised brass border, corner screws and gold lettering. The page title follows it.

- The published library's owner is set in `index.html`: `<meta name="library-owner" content="Ramyani">`.
- **+ New library** asks whose library it will be before you load a file. The current shelf is kept until a new file actually loads, so **Back to the bookshelf** (or Esc) returns to it. The name is remembered with the new library in the browser.
- **Share library** asks for the name too (prefilled), and the link carries it, so the recipient sees the same plaque. Leave the name blank for no plaque.

## Sharing

**Share library** (top right, next to **+ New library**) copies a link, or opens the share sheet on phones.

- The library published with the site (`library.csv`) is shared as the site's own address.
- A library loaded from a file only exists in that browser, so it is compressed into the link itself, after the `#`. That part never reaches a server. A 200-book library with reviews makes a link of roughly 26,000 characters. If a library is so large the link would pass about 60,000, reviews are left out.
- Opening a shared link shows that library without replacing the visitor's own.

## Performance notes

Each spine is created once, sits on its own GPU layer, and is moved only by position and transform, so sorting doesn't repaint anything. Two things that looked harmless were expensive and are deliberately avoided: rounded corners on the spine's inner texture layers (the spine itself clips them), and a CSS filter on each spine.

## Opening a book

Click (or press Enter on) a spine. The book is drawn off the shelf and turns into a front cover in the same binding, beside:

- title and author
- the reader's star rating (quarter stars supported) and review, with `<spoiler>` sections blurred until clicked
- a community rating: the Goodreads average when the export has an "Average Rating" column (recent exports don't), otherwise the rating from Open Library readers, with how many ratings it's based on. Open Library is searched several ways and the best-rated matching entry is used; ratings from fewer than 10 people are shown dimmed and flagged as thin. Goodreads closed its API in 2020, and Google Books now needs an API key, so Open Library is the only keyless source.
- date read, year published, page count, and a link to the book on Goodreads

Use the arrows or the ← → keys to move along the shelf, and × or Esc to put the book back.

## Planned

- Hover: the book tips out of the shelf towards you.
