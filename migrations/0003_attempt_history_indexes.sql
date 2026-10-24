-- Keyset traversal and material-scoped plans, including long-lived accounts.
CREATE INDEX attempts_user_created_id_idx ON attempts (user_id, created_at, id);
CREATE INDEX attempts_user_material_created_id_idx ON attempts (user_id, material_id, created_at, id);
