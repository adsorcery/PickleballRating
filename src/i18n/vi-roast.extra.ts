/**
 * A handful of neutral Vietnamese labels that the provided library does not cover but that the
 * mode needs for accuracy (the model caveat and column labels). These are plain translations of
 * existing English text, not jokes. Everything else falls back to English.
 */
export const viExtra = {
  "leaderboard.description":
    "Xếp theo điểm Cinco hiện tại. Người chơi “provisional” có dưới 15 trận tính điểm nên điểm biến động nhanh hơn.",
  "leaderboard.trend7": "7 ngày",
  "leaderboard.trend30": "30 ngày",
  "predictor.caveat":
    "Tỷ lệ bóng dự kiến không phải xác suất thắng trận. Xác suất thắng giả định mọi pha bóng độc lập và chưa được hiệu chỉnh với dữ liệu của nhóm, nên chỉ để tham khảo.",
  "common.copied": "Đã chép!",
  "player.duprNote": "chỉ để tham khảo, không dùng để tính điểm Cinco",
} as const;

export type ExtraKey = keyof typeof viExtra;

export const enExtra: Record<ExtraKey, string> = {
  "leaderboard.description":
    "Sorted by current Cinco Point. Provisional players have fewer than 15 rated games, so their ratings move faster.",
  "leaderboard.trend7": "7 days",
  "leaderboard.trend30": "30 days",
  "predictor.caveat":
    "Win probability assumes every rally is independent and won with that point share. It is a simplified model, still uncalibrated against our group's results, so treat it as a guide, not a prediction.",
  "common.copied": "Copied!",
  "player.duprNote": "shown for reference only; it is not used in Cinco",
};
