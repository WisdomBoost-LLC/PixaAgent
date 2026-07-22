# .pixa/

This folder is Pixa Agent's local search index — cached numeric
representations (embeddings) of your code, used for semantic
('search by meaning') code search inside the editor.

- It never leaves your machine — everything here is generated and
  read locally, nothing is uploaded.
- It is safe to delete. Pixa will automatically rebuild it.
- It is git-ignored and should never be committed.

If a file inside here looks like gibberish or partial code
fragments, that's expected — it's index data, not a copy of your
repository.
