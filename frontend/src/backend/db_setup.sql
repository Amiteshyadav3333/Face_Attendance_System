-- Run this in MySQL: mysql -u root -p attendance_system < db_setup.sql

CREATE DATABASE IF NOT EXISTS attendance_system;
USE attendance_system;

-- Users table (admin, teacher, student)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('admin', 'teacher', 'student') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    name VARCHAR(255) NOT NULL,
    roll_number VARCHAR(50) UNIQUE NOT NULL,
    year VARCHAR(50) NOT NULL,
    face_image_path VARCHAR(500),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    teacher_id INT NOT NULL,
    year VARCHAR(50) NOT NULL,
    total_classes INT DEFAULT 0,
    college_open_time TIME NULL,
    college_close_time TIME NULL,
    class_start_time TIME NULL,
    class_end_time TIME NULL,
    class_days VARCHAR(100) NULL,
    current_topic VARCHAR(255) NULL,
    next_topic VARCHAR(255) NULL,
    topic_updated_at DATETIME NULL,
    schedule_updated_at DATETIME NULL,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    subject_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('present', 'absent') DEFAULT 'present',
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    marked_by_user_id INT NULL,
    mark_method ENUM('face_liveness','teacher_manual') NOT NULL DEFAULT 'face_liveness',
    manual_reason VARCHAR(500) NULL,
    UNIQUE KEY unique_attendance (student_id, subject_id, date),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (marked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- A teacher opens a short attendance window for one subject/class.
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT NOT NULL,
    teacher_id INT NOT NULL,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    center_lat DECIMAL(10,7) NULL,
    center_lng DECIMAL(10,7) NULL,
    radius_meters INT NOT NULL DEFAULT 250,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    INDEX idx_active_subject (subject_id, is_active)
);

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

CREATE TABLE IF NOT EXISTS chat_conversations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    conversation_type ENUM('direct','group','class') NOT NULL,
    title VARCHAR(160) NULL,
    subject_id INT NULL,
    direct_pair_key VARCHAR(64) NULL UNIQUE,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_class_conversation_subject (subject_id)
);

CREATE TABLE IF NOT EXISTS chat_participants (
    conversation_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    added_by_user_id INT NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chat_participant_user (user_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS classroom_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    sender_user_id INT NOT NULL,
    message_type ENUM('text','note','assignment','submission','call_signal','poll','event') NOT NULL DEFAULT 'text',
    body TEXT NOT NULL,
    metadata_json LONGTEXT NULL,
    attachment_name VARCHAR(255) NULL,
    attachment_mime VARCHAR(160) NULL,
    attachment_data LONGTEXT NULL,
    due_at DATETIME NULL,
    legacy_message_id BIGINT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_classroom_messages (conversation_id, created_at)
);

CREATE TABLE IF NOT EXISTS classroom_poll_votes (
    message_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    option_index TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES classroom_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Default admin insert (firebase_uid baad mein update karo)
INSERT IGNORE INTO users (firebase_uid, email, role) 
VALUES ('ADMIN_FIREBASE_UID', 'admin@facesystem.com', 'admin');

-- Teacher-assigned student project groups and daily progress tracking.
CREATE TABLE IF NOT EXISTS project_groups (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    description TEXT NULL,
    project_url VARCHAR(500) NULL,
    subject_id INT NOT NULL,
    teacher_id INT NOT NULL,
    share_token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    INDEX idx_project_groups_teacher (teacher_id, created_at)
);
CREATE TABLE IF NOT EXISTS project_members (
    group_id BIGINT NOT NULL,
    student_id INT NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, student_id),
    FOREIGN KEY (group_id) REFERENCES project_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    INDEX idx_project_member_student (student_id, group_id)
);
CREATE TABLE IF NOT EXISTS project_tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    due_date DATE NOT NULL,
    points SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES project_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_project_tasks_due (group_id, due_date)
);
CREATE TABLE IF NOT EXISTS project_daily_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    student_id INT NOT NULL,
    task_id BIGINT NOT NULL,
    log_date DATE NOT NULL,
    work_done TEXT NOT NULL,
    learned TEXT NOT NULL,
    technologies VARCHAR(500) NOT NULL,
    progress_url VARCHAR(500) NULL,
    score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    teacher_feedback VARCHAR(1000) NULL,
    scored_by_user_id INT NULL,
    scored_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_project_daily_log (group_id, student_id, task_id, log_date),
    FOREIGN KEY (group_id, student_id) REFERENCES project_members(group_id, student_id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (scored_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_project_logs_score (group_id, score),
    INDEX idx_project_logs_date (group_id, log_date)
);
