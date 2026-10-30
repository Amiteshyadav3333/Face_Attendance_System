-- Per-subject campus hours, class timetable and teacher topic updates.
USE attendance_system;
DROP PROCEDURE IF EXISTS apply_subject_schedule_migration;
DELIMITER $$
CREATE PROCEDURE apply_subject_schedule_migration()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='college_open_time') THEN
    ALTER TABLE subjects ADD COLUMN college_open_time TIME NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='college_close_time') THEN
    ALTER TABLE subjects ADD COLUMN college_close_time TIME NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='class_start_time') THEN
    ALTER TABLE subjects ADD COLUMN class_start_time TIME NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='class_end_time') THEN
    ALTER TABLE subjects ADD COLUMN class_end_time TIME NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='class_days') THEN
    ALTER TABLE subjects ADD COLUMN class_days VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='current_topic') THEN
    ALTER TABLE subjects ADD COLUMN current_topic VARCHAR(255) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='next_topic') THEN
    ALTER TABLE subjects ADD COLUMN next_topic VARCHAR(255) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='topic_updated_at') THEN
    ALTER TABLE subjects ADD COLUMN topic_updated_at DATETIME NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='subjects' AND column_name='schedule_updated_at') THEN
    ALTER TABLE subjects ADD COLUMN schedule_updated_at DATETIME NULL;
  END IF;
END$$
DELIMITER ;
CALL apply_subject_schedule_migration();
DROP PROCEDURE apply_subject_schedule_migration;
