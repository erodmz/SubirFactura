-- CreateTable
CREATE TABLE "client_members" (
    "client_profile_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_members_pkey" PRIMARY KEY ("client_profile_id","user_id")
);

-- CreateIndex
CREATE INDEX "client_members_user_id_idx" ON "client_members"("user_id");

-- AddForeignKey
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: el contacto principal existente pasa a ser miembro del cliente
INSERT INTO "client_members" ("client_profile_id", "user_id", "created_at")
SELECT "id", "user_id", now() FROM "client_profiles" WHERE "user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
