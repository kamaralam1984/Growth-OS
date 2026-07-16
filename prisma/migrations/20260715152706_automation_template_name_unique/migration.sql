-- AlterTable: name needs to be unique so the prebuilt-template seed can
-- upsert on it instead of duplicating rows on every re-run.
CREATE UNIQUE INDEX "AutomationTemplate_name_key" ON "AutomationTemplate"("name");
