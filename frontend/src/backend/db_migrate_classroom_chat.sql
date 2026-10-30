-- Expand direct teacher/student chats into conversations with groups, class
-- channels, polls, events and attachments. Run as a database administrator.
USE attendance_system;

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

-- Preserve existing teacher/student messages as one-to-one conversations.
INSERT IGNORE INTO chat_conversations
  (conversation_type, title, direct_pair_key, created_by_user_id, created_at)
SELECT 'direct', NULL,
       CONCAT(LEAST(t.user_id,s.user_id), ':', GREATEST(t.user_id,s.user_id)),
       t.user_id, COALESCE(MIN(m.created_at), CURRENT_TIMESTAMP)
FROM chat_messages m
JOIN teachers t ON t.id=m.teacher_id
JOIN students s ON s.id=m.student_id
WHERE s.user_id IS NOT NULL
GROUP BY t.user_id,s.user_id,s.name;

INSERT IGNORE INTO chat_participants (conversation_id,user_id,added_by_user_id)
SELECT c.id,t.user_id,t.user_id
FROM chat_conversations c
JOIN teachers t ON c.direct_pair_key LIKE CONCAT(t.user_id, ':%') OR c.direct_pair_key LIKE CONCAT('%:', t.user_id)
JOIN students s ON CONCAT(LEAST(t.user_id,s.user_id), ':', GREATEST(t.user_id,s.user_id))=c.direct_pair_key
WHERE c.conversation_type='direct' AND s.user_id IS NOT NULL;

INSERT IGNORE INTO chat_participants (conversation_id,user_id,added_by_user_id)
SELECT c.id,s.user_id,c.created_by_user_id
FROM chat_conversations c
JOIN students s ON CONCAT(LEAST(c.created_by_user_id,s.user_id), ':', GREATEST(c.created_by_user_id,s.user_id))=c.direct_pair_key
WHERE c.conversation_type='direct' AND s.user_id IS NOT NULL;

INSERT IGNORE INTO classroom_messages
  (conversation_id,sender_user_id,message_type,body,attachment_name,attachment_mime,attachment_data,due_at,legacy_message_id,created_at)
SELECT c.id,m.sender_user_id,m.message_type,m.body,m.attachment_name,
       CASE WHEN m.attachment_data IS NULL THEN NULL ELSE 'application/octet-stream' END,
       m.attachment_data,m.due_at,m.id,m.created_at
FROM chat_messages m
JOIN teachers t ON t.id=m.teacher_id
JOIN students s ON s.id=m.student_id
JOIN chat_conversations c ON c.direct_pair_key=CONCAT(LEAST(t.user_id,s.user_id), ':', GREATEST(t.user_id,s.user_id))
WHERE s.user_id IS NOT NULL;
