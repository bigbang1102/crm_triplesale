/**
 * The permission codes of the AI HUB module — from "Permission Dic.xlsx" (sheet Permission, bpname `AI_HUB`, roletype `aihub`).
 * Framework-free (the fake sign-in loads it in Node through `all-roles.ts`).
 *
 *   AI_ACCESS_USE        enter the AI HUB menu / pages — a tool also needs its own `AI_*_USE` (below), else it is hidden
 *   AI_<TOOL>_USE        one tool (`AI_TOOL_ROLE`)
 *   AI_CHAT_USE          the AI assistant of the right-hand panel · history of the user's own chats (enforced by the service)
 *   AI_CONNECT_USE       connect Google Drive / OneDrive / Canva (enforced by the service)
 *   AI_*_MANAGE          library / image templates / Claude Code keys (the service answers `canManage` / `admin` per user)
 *   AI_ADMIN_*           the Admin page of the hub (`AI_ADMIN_ROLES`: any one opens it)
 * `AI_LIBRARY_MANAGE` was `AIHUB_Library_Manage` and `AI_CLAUDE_CODE_MANAGE` was `AIHUB_ClaudeCode_Manage`.
 */
export const AI_HUB_ROLE = {
  aiAccessUse: 'AI_ACCESS_USE',
  aiChatUse: 'AI_CHAT_USE',
  aiConnectUse: 'AI_CONNECT_USE',

  aiDocAnalyzeUse: 'AI_DOC_ANALYZE_USE',
  aiDocSummaryUse: 'AI_DOC_SUMMARY_USE',
  aiDataAnalyzeUse: 'AI_DATA_ANALYZE_USE',
  aiMeetingUse: 'AI_MEETING_USE',
  aiDocCompareUse: 'AI_DOC_COMPARE_USE',
  aiDocExtractUse: 'AI_DOC_EXTRACT_USE',
  aiDocCheckUse: 'AI_DOC_CHECK_USE',
  aiSlidesUse: 'AI_SLIDES_USE',
  aiImageUse: 'AI_IMAGE_USE',
  aiVideoUse: 'AI_VIDEO_USE',
  aiMusicUse: 'AI_MUSIC_USE',
  aiSocialUse: 'AI_SOCIAL_USE',
  aiArticleUse: 'AI_ARTICLE_USE',
  aiVoiceoverUse: 'AI_VOICEOVER_USE',
  aiGifUse: 'AI_GIF_USE',
  aiCodeUse: 'AI_CODE_USE',
  aiClaudeCodeUse: 'AI_CLAUDE_CODE_USE',
  aiCodeReviewUse: 'AI_CODE_REVIEW_USE',
  aiSqlAssistUse: 'AI_SQL_ASSIST_USE',
  aiLogDoctorUse: 'AI_LOG_DOCTOR_USE',
  aiCodeDocsUse: 'AI_CODE_DOCS_USE',
  aiStrategyUse: 'AI_STRATEGY_USE',
  aiHowtoUse: 'AI_HOWTO_USE',
  aiDiagramUse: 'AI_DIAGRAM_USE',
  aiLibraryUse: 'AI_LIBRARY_USE',
  aiQuizUse: 'AI_QUIZ_USE',
  aiFaqUse: 'AI_FAQ_USE',
  aiProjectPlanUse: 'AI_PROJECT_PLAN_USE',
  aiDecisionUse: 'AI_DECISION_USE',
  aiFormalWriterUse: 'AI_FORMAL_WRITER_USE',
  aiReplyDraftUse: 'AI_REPLY_DRAFT_USE',
  aiHrDocsUse: 'AI_HR_DOCS_USE',
  aiCustomerBriefUse: 'AI_CUSTOMER_BRIEF_USE',

  aiLibraryManage: 'AI_LIBRARY_MANAGE',
  aiImageTemplateManage: 'AI_IMAGE_TEMPLATE_MANAGE',
  aiClaudeCodeManage: 'AI_CLAUDE_CODE_MANAGE',

  aiAdminUsageView: 'AI_ADMIN_USAGE_VIEW',
  aiAdminUsageAllBranch: 'AI_ADMIN_USAGE_ALL_BRANCH',
  aiAdminUsageExport: 'AI_ADMIN_USAGE_EXPORT',
  aiAdminQuotaManage: 'AI_ADMIN_QUOTA_MANAGE',
  aiAdminSystemView: 'AI_ADMIN_SYSTEM_VIEW',
} as const;

/** the tool id of the page (`/ai/hub/<id>`) → the permission to use it. `customer-brief` also needs `CRM_Prospect_View` (the page's own switch). */
export const AI_TOOL_ROLE: Readonly<Record<string, string>> = {
  'doc-analyze': AI_HUB_ROLE.aiDocAnalyzeUse,
  'doc-summary': AI_HUB_ROLE.aiDocSummaryUse,
  'data-analyze': AI_HUB_ROLE.aiDataAnalyzeUse,
  meeting: AI_HUB_ROLE.aiMeetingUse,
  'doc-compare': AI_HUB_ROLE.aiDocCompareUse,
  'doc-extract': AI_HUB_ROLE.aiDocExtractUse,
  'doc-check': AI_HUB_ROLE.aiDocCheckUse,
  slides: AI_HUB_ROLE.aiSlidesUse,
  image: AI_HUB_ROLE.aiImageUse,
  video: AI_HUB_ROLE.aiVideoUse,
  music: AI_HUB_ROLE.aiMusicUse,
  social: AI_HUB_ROLE.aiSocialUse,
  article: AI_HUB_ROLE.aiArticleUse,
  voiceover: AI_HUB_ROLE.aiVoiceoverUse,
  gif: AI_HUB_ROLE.aiGifUse,
  code: AI_HUB_ROLE.aiCodeUse,
  'claude-code': AI_HUB_ROLE.aiClaudeCodeUse,
  'code-review': AI_HUB_ROLE.aiCodeReviewUse,
  'sql-assist': AI_HUB_ROLE.aiSqlAssistUse,
  'log-doctor': AI_HUB_ROLE.aiLogDoctorUse,
  'code-docs': AI_HUB_ROLE.aiCodeDocsUse,
  strategy: AI_HUB_ROLE.aiStrategyUse,
  howto: AI_HUB_ROLE.aiHowtoUse,
  diagram: AI_HUB_ROLE.aiDiagramUse,
  'library-ask': AI_HUB_ROLE.aiLibraryUse,
  quiz: AI_HUB_ROLE.aiQuizUse,
  faq: AI_HUB_ROLE.aiFaqUse,
  'project-plan': AI_HUB_ROLE.aiProjectPlanUse,
  decision: AI_HUB_ROLE.aiDecisionUse,
  'formal-writer': AI_HUB_ROLE.aiFormalWriterUse,
  'reply-draft': AI_HUB_ROLE.aiReplyDraftUse,
  'hr-docs': AI_HUB_ROLE.aiHrDocsUse,
  'customer-brief': AI_HUB_ROLE.aiCustomerBriefUse,
};

/** the Admin page of the hub: any one of these opens it (the service still decides what each tab shows) */
export const AI_ADMIN_ROLES: string = [
  AI_HUB_ROLE.aiAdminUsageView,
  AI_HUB_ROLE.aiAdminUsageAllBranch,
  AI_HUB_ROLE.aiAdminUsageExport,
  AI_HUB_ROLE.aiAdminQuotaManage,
  AI_HUB_ROLE.aiAdminSystemView,
].join(',');

/** the Admin pages "who uses how many tokens" and "usage detail + quotas": the usage rights (an OR-list) */
export const AI_ADMIN_USAGE_ROLES: string = [
  AI_HUB_ROLE.aiAdminUsageView,
  AI_HUB_ROLE.aiAdminUsageAllBranch,
  AI_HUB_ROLE.aiAdminUsageExport,
].join(',');

/** the Admin page "usage audit": the system-view right or the export right */
export const AI_ADMIN_AUDIT_ROLES: string = [
  AI_HUB_ROLE.aiAdminSystemView,
  AI_HUB_ROLE.aiAdminUsageExport,
].join(',');

/** the permission (an OR-list for `PermissionService.has`) a tool page needs besides `AI_ACCESS_USE`; `''` = the page names no tool of its own (hub home) */
export function aiToolRequires(tool: string | undefined): string {
  if (!tool) return '';
  if (tool === 'admin') return AI_ADMIN_ROLES;
  return AI_TOOL_ROLE[tool] ?? '';
}
