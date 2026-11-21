CREATE DATABASE IF NOT EXISTS `nuestra_historia` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `nuestra_historia`;

CREATE TABLE IF NOT EXISTS profiles (
    role ENUM('blue', 'pink') NOT NULL PRIMARY KEY,
    username VARCHAR(40) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
    display_name VARCHAR(60) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    session_version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS memories (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    author_role ENUM('blue', 'pink') NOT NULL,
    title VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    photo_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    photo_type VARCHAR(40) CHARACTER SET ascii DEFAULT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_memory_author FOREIGN KEY (author_role) REFERENCES profiles(role),
    INDEX memories_order (created_at, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_limits (
    rate_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at BIGINT UNSIGNED NOT NULL,
    INDEX limits_expiry (expires_at)
) ENGINE=InnoDB;
