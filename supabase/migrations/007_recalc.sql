-- 007_recalc.sql — slice 11
--
-- One column. `derivation_sources` already records *which* block a derivation
-- read and at *which version* — that is what the cascade in 001 fires on, and
-- none of it changes here.
--
-- What it does not record is what the block actually said at that moment, and
-- /review's whole job is to show "here is what changed in your note". Without a
-- snapshot the best the screen could say is "this source moved from version 2
-- to version 3", which is the difference between a receipt and a real diff.
--
-- Nullable on purpose: the rows written by hand in staleness.test.ts and
-- tiptap-staleness.test.ts have no snapshot, and neither do any rows that
-- predate this migration. A source with no snapshot renders as "changed", with
-- no before/after — truthful rather than invented.
--
-- Append-only: never edit this file once applied.

alter table derivation_sources
  add column source_text text;

comment on column derivation_sources.source_text is
  'The normalised plain text of the source block as it was actually read at generation time. Null means no snapshot was taken (rows written before slice 11).';
