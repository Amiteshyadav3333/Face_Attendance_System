-- Idempotent feature migration for attendance radius and teacher/student chat.
USE attendance_system;

DROP PROCEDURE IF EXISTS apply_face_attendance_feature_migration;
DELIMITER $$
CREATE PROCEDURE apply_face_attendance_feature_migration()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance_sessions' AND column_name='center_lat') THEN
    ALTER TABLE attendance_sessions ADD COLUMN center_lat DECIMAL(10,7) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance_sessions' AND column_name='center_lng') THEN
    ALTER TABLE attendance_sessions ADD COLUMN center_lng DECIMAL(10,7) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance_sessions' AND column_name='radius_meters') THEN
    ALTER TABLE attendance_sessions ADD COLUMN radius_meters INT NOT NULL DEFAULT 250;
  END IF;
  CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    student_id INT NOT NULL,
    sender_user_id INT NOT NULL,
    message_type ENUM('text','note','assignment','submission','call_signal') NOT NULL DEFAULT 'text',
    body TEXT NOT NULL,
    attachment_name VARCHAR(255) NULL,
    attachment_data LONGTEXT NULL,
    due_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chat_pair (teacher_id, student_id, created_at)
  );
END$$
DELIMITER ;
CALL apply_face_attendance_feature_migration();
DROP PROCEDURE apply_face_attendance_feature_migration;
