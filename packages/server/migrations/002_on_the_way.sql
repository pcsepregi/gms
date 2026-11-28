-- "Úton": a lap meg van rendelve, de még nem érkezett meg. Csak nem "megvan" lapnál lehet
-- igaz (a "megvan" jelölés törli); a megvan/hiányzik szám ettől nem változik.
ALTER TABLE card ADD COLUMN on_the_way INTEGER NOT NULL DEFAULT 0 CHECK (on_the_way IN (0,1));
