# Saved posts

This folder is for posts you chose to keep and then deliberately copied into the repository.

The app stores favourites in the browser only. It cannot commit to GitHub, and it has no token. To keep a copy here:

1. In the app, open Subjects and choose Export JSON.
2. From the repository root, run `node scripts/import-saved.mjs path/to/intelligensiatok-saved.json`.
3. Look at the diff and commit `saved/` if you want these posts in the repo.

`manifest.json` is a list of imported ids. One JSON file per post sits beside it.

If this repository is public, anything you commit here is public. Leaving favourites in the browser is the private option. Exporting a Markdown file is a private copy that never has to be committed.

Posts in this folder are not the feed. The feed is built only from `content/posts/` with status `published`.
