-- Allow institutions to use their own year/semester/batch labels while keeping
-- existing student and subject values unchanged.
USE attendance_system;

DROP PROCEDURE IF EXISTS migrate_academic_year_labels;
DELIMITER $$
CREATE PROCEDURE migrate_academic_year_labels()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='students'
      AND column_name='year' AND data_type='enum'
  ) THEN
    ALTER TABLE students MODIFY COLUMN year VARCHAR(50) NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='subjects'
      AND column_name='year' AND data_type='enum'
  ) THEN
    ALTER TABLE subjects MODIFY COLUMN year VARCHAR(50) NOT NULL;
  END IF;
END$$
DELIMITER ;

CALL migrate_academic_year_labels();
DROP PROCEDURE migrate_academic_year_labels;
