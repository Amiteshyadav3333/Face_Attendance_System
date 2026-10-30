-- Add a teacher-audited fallback for students whose device cannot mark attendance.
USE attendance_system;

DROP PROCEDURE IF EXISTS apply_manual_attendance_migration;
DELIMITER $$
CREATE PROCEDURE apply_manual_attendance_migration()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance' AND column_name='marked_by_user_id') THEN
    ALTER TABLE attendance ADD COLUMN marked_by_user_id INT NULL AFTER marked_at;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance' AND column_name='mark_method') THEN
    ALTER TABLE attendance ADD COLUMN mark_method ENUM('face_liveness','teacher_manual') NOT NULL DEFAULT 'face_liveness' AFTER marked_by_user_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance' AND column_name='manual_reason') THEN
    ALTER TABLE attendance ADD COLUMN manual_reason VARCHAR(500) NULL AFTER mark_method;
  END IF;
END$$
DELIMITER ;
CALL apply_manual_attendance_migration();
DROP PROCEDURE apply_manual_attendance_migration;
