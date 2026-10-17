CREATE TRIGGER IF NOT EXISTS inventory_quantity_min_insert
BEFORE INSERT ON inventory_entries
FOR EACH ROW
WHEN NEW.quantity < 1
BEGIN
  SELECT RAISE(ABORT, 'quantity must be at least 1');
END;

CREATE TRIGGER IF NOT EXISTS inventory_quantity_min_update
BEFORE UPDATE OF quantity ON inventory_entries
FOR EACH ROW
WHEN NEW.quantity < 1
BEGIN
  SELECT RAISE(ABORT, 'quantity must be at least 1');
END;
