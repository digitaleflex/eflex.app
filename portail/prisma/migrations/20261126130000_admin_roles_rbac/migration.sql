-- ADM-1 : les administrateurs existants deviennent super_admin.
-- ADMIN_EMAILS ne sert plus qu'au bootstrap du premier super admin.
UPDATE "User" SET "role" = 'super_admin' WHERE "role" = 'admin';
