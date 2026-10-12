ALTER TABLE "Event"
ADD COLUMN "poster_blob_path" TEXT;

CREATE INDEX "Event_poster_blob_path_idx"
ON "Event" ("poster_blob_path");
