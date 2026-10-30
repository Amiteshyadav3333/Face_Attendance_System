-- Teacher assigned group projects, daily progress, scoring and public share links.
USE attendance_system;

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
