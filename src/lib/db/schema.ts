import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    initialCincoRating: real("initial_cinco_rating").notNull(),
    currentCincoRating: real("current_cinco_rating").notNull(),
    duprRating: real("dupr_rating"),
    avatarUrl: text("avatar_url"),
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    index("players_display_name_idx").on(t.displayName),
    uniqueIndex("players_display_name_nocase_uq").on(sql`lower(${t.displayName})`),
  ],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin"] })
    .notNull()
    .default("admin"),
  /** Admin's preferred winning rule for the match-entry form (1 or 2). */
  preferredWinBy: integer("preferred_win_by").notNull().default(1),
  createdAt: ts("created_at").notNull(),
  lastLoginAt: ts("last_login_at"),
});

/** Authentication sessions. The primary key is a SHA-256 hash of the cookie token. */
export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)],
);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStart: ts("window_start").notNull(),
  lockedUntil: ts("locked_until"),
});

/** Optional play sessions (UI deferred in v1). */
export const playSessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
});

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").references(() => playSessions.id),
    playedAt: ts("played_at").notNull(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
    formatTarget: integer("format_target").notNull(),
    // Rows that existed before this column was added were all played win-by-2, hence the DB default of 2.
    // The application always writes the value explicitly (new matches default to 1).
    winBy: integer("win_by").notNull().default(2),
    scoreA: integer("score_a").notNull(),
    scoreB: integer("score_b").notNull(),
    status: text("status", { enum: ["draft", "confirmed", "void"] }).notNull(),
    rated: integer("rated", { mode: "boolean" }).notNull().default(true),
    algorithmVersion: text("algorithm_version").notNull(),
    configSnapshot: text("config_snapshot", { mode: "json" }).notNull(),
    predictedPointShareA: real("predicted_point_share_a"),
    predictedWinProbA: real("predicted_win_prob_a"),
    enteredBy: text("entered_by").references(() => users.id),
    confirmedAt: ts("confirmed_at"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    notes: text("notes"),
  },
  (t) => [
    index("matches_status_played_idx").on(t.status, t.playedAt, t.id),
    check("matches_format_chk", sql`${t.formatTarget} in (11, 15, 21)`),
    check("matches_scores_chk", sql`${t.scoreA} >= 0 and ${t.scoreB} >= 0`),
  ],
);

export const matchPlayers = sqliteTable(
  "match_players",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    team: text("team", { enum: ["A", "B"] }).notNull(),
    position: integer("position").notNull(),
    preRating: real("pre_rating"),
    deltaRating: real("delta_rating"),
    postRating: real("post_rating"),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.playerId] }),
    uniqueIndex("match_players_slot_uq").on(t.matchId, t.team, t.position),
    index("match_players_player_idx").on(t.playerId, t.matchId),
    check("match_players_team_chk", sql`${t.team} in ('A', 'B')`),
    check("match_players_position_chk", sql`${t.position} in (1, 2)`),
  ],
);

export const ratingHistory = sqliteTable(
  "rating_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    ratingBefore: real("rating_before").notNull(),
    ratingAfter: real("rating_after").notNull(),
    delta: real("delta").notNull(),
    playedAt: ts("played_at").notNull(),
  },
  (t) => [
    uniqueIndex("rating_history_player_match_uq").on(t.playerId, t.matchId),
    index("rating_history_player_played_idx").on(t.playerId, t.playedAt),
  ],
);

export const ratingConfigVersions = sqliteTable("rating_config_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: integer("version").notNull().unique(),
  algorithmVersion: text("algorithm_version").notNull(),
  beta: real("beta").notNull(),
  k: real("k").notNull(),
  maximumTeamDelta: real("maximum_team_delta").notNull(),
  weights: text("weights", { mode: "json" }).notNull(),
  matchupDiscount: text("matchup_discount", { mode: "json" }).notNull(),
  trailingWindowDays: integer("trailing_window_days").notNull(),
  provisionalGames: integer("provisional_games").notNull(),
  timezone: text("timezone").notNull(),
  effectiveAt: ts("effective_at").notNull(),
  createdBy: text("created_by"),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorId: text("actor_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    beforeJson: text("before_json", { mode: "json" }),
    afterJson: text("after_json", { mode: "json" }),
    reason: text("reason"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("audit_logs_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

export const predictionSnapshots = sqliteTable("prediction_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: text("match_id").references(() => matches.id, { onDelete: "cascade" }),
  inputJson: text("input_json", { mode: "json" }).notNull(),
  probabilityA: real("probability_a").notNull(),
  createdAt: ts("created_at").notNull(),
});

export const backupRuns = sqliteTable("backup_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  kind: text("kind").notNull(),
  localPath: text("local_path"),
  sizeBytes: integer("size_bytes"),
  offsiteStatus: text("offsite_status", { enum: ["skipped", "ok", "failed"] }),
  error: text("error"),
});
