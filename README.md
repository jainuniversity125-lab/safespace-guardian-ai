# Guardian AI

AI Cyberbullying Detection Application

Build the system as a human-in-the-loop content-safety platform that accepts social-media text, images, videos, and reports; detects potential cyberbullying; assigns severity and category; and routes uncertain or high-risk cases to trained moderators. AI should assist moderation, not make irreversible decisions alone, because language, sarcasm, regional expressions, and context can produce false positives. NIST recommends aligning AI systems with organizational risk tolerance and using human review where model performance is weak.[nvlpubs.nist]

1. Application Objectives

The application should:

Detect abusive, threatening, humiliating, discriminatory, and repeated targeted content.

Classify the type and severity of cyberbullying.

Identify possible victims, targets, perpetrators, and repeated incidents.

Analyze text, images, videos, audio transcripts, usernames, hashtags, and conversation context.

Provide explanations for moderator decisions.

Allow users to report, appeal, block, mute, or hide content.

Protect personal data, especially when children may use the platform.

Maintain an audit trail for moderation, appeals, and model decisions.

Cyberbullying datasets commonly contain categories such as non-bullying, race/ethnicity-related abuse, gender/sexual abuse, and religion-related abuse. Public research has also used YouTube comments collected through the YouTube API for cyberbullying classification.[pmc.ncbi.nlm.nih]

2. Main User Roles

RoleFunctionsUserCreate account, submit content, report abuse, block users, view decisions, appeal actionsVictim or reporterSubmit incident report, attach evidence, receive safety recommendations, track case statusModeratorReview flagged content, inspect context, approve or override AI result, apply enforcementAdministratorManage users, policies, thresholds, categories, moderators, reports, and system settingsData scientistUpload datasets, create labels, train models, compare versions, monitor performanceAuditorView immutable logs, moderation history, model versions, and compliance reportsSupport or counselorHandle severe-risk cases and provide referral information

3. Cyberbullying Categories

Use a multi-label classification system because one message may belong to more than one category.

Content categories

Insult or humiliation.

Harassment.

Threat or intimidation.

Hate or identity-based abuse.

Sexual harassment.

Sexual exploitation or non-consensual intimate-content risk.

Doxxing or personal-information exposure.

Impersonation.

Rumor or reputation attack.

Exclusion or coordinated pile-on.

Stalking or repeated unwanted contact.

Self-harm encouragement.

Non-bullying or acceptable content.

Ambiguous content requiring human review.

Severity levels

LevelMeaningExample actionLowOffensive or rude but limited targetingWarning, reduce visibilityMediumTargeted harassment or repeated abuseHide content, notify moderatorHighThreats, doxxing, sexual abuse, coordinated attacksImmediate escalation and evidence preservationCriticalCredible physical threat, child-safety issue, self-harm encouragementUrgent specialist review and emergency procedures

Do not automatically label a user as a “bully” based on one prediction. Store content-level risk and incident-level evidence separately.

4. Recommended Tech Stack

Frontend

Web: React.js with TypeScript.

Mobile: Flutter or React Native.

UI: Material UI, Tailwind CSS, or Angular Material.

State management: Redux Toolkit, Zustand, or TanStack Query.

Charts: Apache ECharts or Plotly.

Accessibility: WCAG-oriented forms, keyboard navigation, screen-reader labels.

Backend

Primary language: Python for AI services.

API framework: FastAPI.

Administrative services: Node.js with NestJS or Python Django.

API format: REST for normal operations; WebSocket or Server-Sent Events for live moderation queues.

Authentication: OAuth 2.0/OpenID Connect, short-lived JWT access tokens, refresh-token rotation.

API documentation: OpenAPI and Swagger UI.

Machine learning

Text baseline: TF-IDF plus Logistic Regression or Linear SVM.

Production text model: Fine-tuned multilingual transformer such as XLM-R or IndicBERT.

Toxicity model: A separate toxicity or abuse classifier used as an ensemble input.

Context model: Transformer or sequence model analyzing multiple messages from the same conversation.

Image OCR: Tesseract, PaddleOCR, or a managed OCR service.

Image moderation: Vision Transformer, CLIP-based classifier, or a managed image-safety API.

Video: FFmpeg for frame extraction, speech-to-text transcription, and frame-level analysis.

Language detection: fastText, CLD3, or a language-identification transformer.

Explainability: SHAP, token highlighting, category evidence, and moderator-visible rules.

Data and infrastructure

Transactional database: PostgreSQL.

Document storage: MongoDB only if flexible event or annotation documents are needed.

Cache and queue: Redis.

Message broker: Apache Kafka, RabbitMQ, or AWS SQS.

Object storage: Amazon S3, Google Cloud Storage, or Azure Blob Storage.

Vector database: pgvector, OpenSearch, or Qdrant for similarity search and duplicate-abuse detection.

Search and analytics: OpenSearch or Elasticsearch.

Experiment tracking: MLflow.

Dataset versioning: DVC or lakeFS.

Containerization: Docker.

Orchestration: Kubernetes for larger deployments; Docker Compose for a prototype.

CI/CD: GitHub Actions, GitLab CI, or Jenkins.

Monitoring: Prometheus, Grafana, OpenTelemetry, and Sentry.

Suggested cloud deployment

For an initial Indian deployment:

AWS Mumbai region or an equivalent India-region cloud.

CloudFront or an API gateway.

Application Load Balancer.

ECS/Fargate or Kubernetes.

RDS PostgreSQL.

ElastiCache Redis.

S3 with server-side encryption.

SQS or Kafka for asynchronous analysis.

CloudWatch plus OpenTelemetry for monitoring.

5. High-Level Architecture

text

Web/Mobile Client
        |
        v
API Gateway + Authentication + Rate Limiting
        |
        v
Content Submission Service
        |
        +--> Text Preprocessing Service
        |          |
        |          v
        |      Text Detection Model
        |
        +--> OCR / Image Moderation Service
        |
        +--> Video Processing Service
        |          |
        |          +--> Frame Extraction
        |          +--> Audio Transcription
        |          +--> Image and Text Detection
        |
        v
Risk Aggregation Service
        |
        +--> Low risk: allow or warn
        +--> Medium risk: reduce visibility or queue
        +--> High risk: hide and send to moderator
        +--> Critical risk: urgent escalation
        |
        v
Moderation Dashboard
        |
        v
Decision, Appeal, Audit, Analytics, Retraining

Use asynchronous processing for videos, large attachments, and batch imports. Return an immediate “processing” status to the client rather than blocking the request.

6. End-to-End Workflow

Step 1: User submits content

The user submits:

Text or comment.

Image or screenshot.

Video or audio.

Conversation identifier.

Optional report reason.

Optional victim or target information.

Optional evidence attachment.

The system creates a content record, generates a unique ID, validates the file type, scans for malware, and stores the original object in encrypted storage.

Step 2: Consent and policy checks

Before processing, display:

What data is collected.

Why it is analyzed.

Retention period.

Whether data is used for model improvement.

How a user can withdraw consent or request deletion.

How reports and appeals work.

For users in India, the Digital Personal Data Protection Act requires verifiable parental consent before processing a child’s personal data, and its consent provisions address informed, specific, unambiguous consent and withdrawal. Do not use behavioral tracking or targeted advertising as part of this safety system for children.[meity.gov]

Step 3: Preprocess content

Text preprocessing

Detect language.

Normalize Unicode.

Preserve emojis and punctuation as useful signals.

Expand or standardize common abbreviations.

Mask phone numbers, emails, addresses, and URLs.

Detect obfuscated abuse, such as repeated symbols or character substitution.

Preserve the original text for authorized moderator review.

Create a sanitized model input.

Generate text chunks for long posts.

Extract hashtags, mentions, reply relationships, and conversation position.

Avoid blindly removing stop words, emojis, or punctuation because they can carry tone and intent.

Image preprocessing

Validate MIME type and file signature.

Resize while preserving an original encrypted copy.

Run OCR.

Detect faces only when necessary and with a clearly defined purpose.

Detect visible threats, slurs, sexual content, private information, and manipulated screenshots.

Combine OCR text with image features.

Video preprocessing

Extract frames at controlled intervals.

Transcribe speech.

Run OCR on selected frames.

Analyze captions, comments, and audio.

Aggregate frame-level and transcript-level scores.

Limit processing duration and file size to prevent denial-of-service attacks.

Step 4: AI inference

The inference service should return structured results such as:

json

{
  "content_id": "cnt_12345",
  "model_version": "text-xlm-r-1.4.0",
  "language": "en",
  "labels": [
    {
      "name": "targeted_harassment",
      "probability": 0.94
    },
    {
      "name": "threat",
      "probability": 0.71
    }
  ],
  "severity": "high",
  "confidence": 0.89,
  "target_detected": true,
  "repetition_score": 0.82,
  "explanation": [
    "direct insult",
    "second-person targeting",
    "repeated message pattern"
  ],
  "requires_human_review": true
}

The output should distinguish:

Probability: model confidence for a label.

Severity: policy-based risk level.

Action: platform response.

Human review requirement: whether a moderator must decide.

Model version: required for reproducibility.

Step 5: Context and repetition analysis

A single message may be ambiguous. Add context features:

Number of messages from the same sender.

Number of messages directed at the same target.

Time interval between messages.

Replies and mentions.

Coordinated posting from multiple accounts.

Prior confirmed incidents.

Whether the target has blocked the sender.

Whether the content is quoting or condemning abuse rather than committing abuse.

Use graph analysis to detect pile-ons, repeated targeting, and coordinated harassment. Do not use protected attributes or sensitive personal data as a direct reason to penalize someone.

Step 6: Risk aggregation

A practical rule-based aggregation can be:

text

final_risk =
  0.45 × text_or_transcript_score
+ 0.20 × context_score
+ 0.15 × repetition_score
+ 0.10 × image_or_ocr_score
+ 0.10 × threat_or_safety_score

Then apply policy rules:

text

IF credible_threat_score >= 0.80:
    severity = CRITICAL
    action = urgent_human_review

ELSE IF doxxing_score >= 0.75 OR sexual_exploitation_score >= 0.75:
    severity = HIGH
    action = hide_content_and_escalate

ELSE IF targeted_harassment_score >= 0.70:
    severity = MEDIUM
    action = moderator_queue

ELSE:
    severity = LOW_OR_SAFE
    action = allow_or_warn

These thresholds are starting points only. Tune them on a validation set using precision-recall trade-offs, not accuracy alone.

Step 7: Apply an intervention

Possible actions include:

Allow content.

Show a “consider revising” warning before posting.

Require confirmation before publication.

Reduce distribution.

Hide content from the target.

Temporarily restrict replies.

Mute or block the sender.

Send the case to moderation.

Preserve evidence for an incident.

Notify a safety team.

Escalate credible threats according to documented legal and organizational procedures.

Avoid automatic permanent bans based solely on a low-confidence prediction.

Step 8: Human moderation

The moderator dashboard should show:

Original content.

Sanitized model view.

Conversation context.

Account and incident history, subject to privacy limits.

Predicted categories and confidence.

Important evidence spans or OCR text.

Similar previously reviewed cases.

Recommended action.

Policy definition.

Appeal history.

Moderator decision options.

Moderator decisions should include:

Confirm violation.

Reject false positive.

Request more context.

Escalate to specialist.

Mark as self-defense or quotation.

Apply warning.

Remove content.

Restrict account.

Close report.

7. Application Features

User features

Registration and secure login.

Age declaration and consent management.

Text, image, and video posting.

Pre-publication safety warning.

Report content or account.

Report repeated harassment.

Attach screenshots or evidence.

Block, mute, and restrict users.

Hide replies and limit mentions.

View report status.

Appeal moderation actions.

Delete content and account.

Safety center with guidance and support links.

Multilingual interface.

Emergency-help guidance for critical situations.

Moderator features

Priority-based moderation queue.

Filters by severity, language, category, platform, and age-related risk.

Full conversation context.

AI explanation and confidence.

Bulk actions with safeguards.

Evidence viewer.

Case assignment.

Internal notes.

Escalation workflow.

SLA timers.

Moderator quality review.

Second-review requirement for critical actions.

Administrator features

Category and policy management.

Threshold configuration.

Role-based access control.

User and moderator management.

Audit-log access.

Data-retention configuration.

Notification templates.

Appeal policy management.

Model deployment approval.

Incident reporting.

Dashboard for volume, latency, precision, and appeals.

Data-science features

Dataset upload and validation.

Annotation interface.

Label taxonomy management.

Inter-annotator agreement.

Train/validation/test splitting.

Dataset and model versioning.

Experiment tracking.

Error analysis.

Bias and subgroup evaluation.

Shadow deployment.

A/B or champion-challenger testing.

Model rollback.

8. Database Design

users

text

id
email_or_phone
password_hash
role
date_of_birth_or_age_band
account_status
consent_status
created_at
updated_at

Prefer age bands over storing a full date of birth when the exact date is unnecessary.

content

text

id
author_id
parent_content_id
conversation_id
content_type
encrypted_storage_uri
sanitized_text
language
visibility_status
created_at
deleted_at

model_predictions

text

id
content_id
model_version
label
probability
severity
explanation_json
requires_review
created_at

reports

text

id
reporter_id
content_id
category
description
evidence_uri
status
priority
assigned_moderator_id
created_at
closed_at

moderation_decisions

text

id
report_id
moderator_id
decision
policy_code
reason
action_duration
created_at

appeals

text

id
decision_id
appellant_id
reason
status
reviewer_id
resolution
created_at
resolved_at

consents

text

id
user_id
consent_type
notice_version
parent_or_guardian_reference
verification_method
obtained_at
withdrawn_at

audit_logs

text

id
actor_id
event_type
object_type
object_id
before_state_hash
after_state_hash
ip_hash
created_at

Do not store raw passwords, unnecessary identity attributes, or unencrypted evidence.

9. API Design

Authentication

text

POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout

Content

text

POST   /api/v1/content
GET    /api/v1/content/{content_id}
DELETE /api/v1/content/{content_id}
POST   /api/v1/content/{content_id}/analyze

Detection

text

POST /api/v1/analyze/text
POST /api/v1/analyze/image
POST /api/v1/analyze/video
GET  /api/v1/analysis/{analysis_id}

Reports

text

POST /api/v1/reports
GET  /api/v1/reports/{report_id}
GET  /api/v1/users/me/reports
POST /api/v1/reports/{report_id}/evidence

Moderation

text

GET  /api/v1/moderation/queue
GET  /api/v1/moderation/cases/{case_id}
POST /api/v1/moderation/cases/{case_id}/decision
POST /api/v1/moderation/cases/{case_id}/escalate

Appeals

text

POST /api/v1/appeals
GET  /api/v1/appeals/{appeal_id}
POST /api/v1/appeals/{appeal_id}/resolve

Model management

text

POST /api/v1/models/register
POST /api/v1/models/{model_id}/deploy
POST /api/v1/models/{model_id}/rollback
GET  /api/v1/models/{model_id}/metrics

Protect all APIs with authorization, request validation, rate limits, object-level access checks, and audit logging. OWASP’s API Security Top 10 identifies the major API risks that should be addressed during design and testing.[owasp]

10. Dataset Plan

Dataset sources

Use a combination of:

Public cyberbullying datasets.

Public offensive-language datasets.

Hate-speech datasets.

Platform-approved API data.

Organization-owned reports.

Synthetic examples for rare patterns.

Carefully reviewed multilingual and code-mixed samples.

One publicly listed dataset contains approximately 100,000 tweets with balanced multi-class labels, including non-cyberbullying and identity-related categories. Another commonly referenced dataset contains approximately 47,000 tweets across six balanced classes.[kaggle]

Recommended label schema

text

is_bullying: yes/no/uncertain
targeted: yes/no/uncertain
harassment: yes/no
threat: yes/no
hate: yes/no
sexual_harassment: yes/no
doxxing: yes/no
impersonation: yes/no
self_harm_encouragement: yes/no
repetition_required: yes/no/unknown
severity: low/medium/high/critical
target_group: none/race/gender/religion/disability/sexual_orientation/other
language: language_code

Data pipeline

text

Collect
  -> Consent and license verification
  -> Remove private or restricted data
  -> De-identify
  -> Normalize
  -> Deduplicate
  -> Annotate
  -> Quality review
  -> Split by user and conversation
  -> Train
  -> Validate
  -> Test
  -> Monitor drift

Split by user, thread, and time, not randomly by individual message only. Otherwise, nearly identical messages from the same user can appear in both training and testing, producing misleadingly high results.

11. Model Development

Baseline model

Start with:

text

Text preprocessing
    -> TF-IDF word and character features
    -> Logistic Regression or Linear SVM
    -> Multi-label probabilities

This baseline is fast, interpretable, and useful for identifying data problems.

Production model

Use:

text

Language detection
    -> Multilingual transformer
    -> Multi-label classification head
    -> Calibration
    -> Policy engine
    -> Human review

Add separate models for:

Threat detection.

Personal-information exposure.

Sexual abuse.

Self-harm encouragement.

Image or video safety.

Repeated-targeting detection.

Use calibrated probabilities, such as temperature scaling or isotonic regression, before setting intervention thresholds.

Evaluation metrics

Track:

Precision.

Recall.

F1 score.

Macro-F1 across languages and categories.

Area under the precision-recall curve.

False-positive rate.

False-negative rate.

Calibration error.

Moderator agreement.

Average inference latency.

Queue-resolution time.

Appeal overturn rate.

Drift in language, topics, and abuse patterns.

For high-risk threats, optimize for high recall while ensuring every high-impact decision receives human review.

12. Privacy and Security

Implement:

Encryption in transit with TLS.

Encryption at rest with managed keys.

Field-level encryption for evidence and sensitive metadata.

Role-based and attribute-based access control.

Least-privilege service accounts.

MFA for moderators and administrators.

Short-lived signed URLs for evidence.

Audit logs that moderators cannot edit.

Database backups with encryption.

Data retention and deletion jobs.

Pseudonymous user IDs for model training.

Separate production data from training data.

Secret management through a vault.

Malware scanning for uploads.

File-size, duration, and request limits.

Abuse prevention and rate limiting.

Regular penetration testing.

Use OWASP API guidance for authorization, authentication, resource-consumption, and inventory controls. For India-based operations, obtain legal review for the Digital Personal Data Protection Act, platform rules, child-safety requirements, and any applicable sector-specific requirements.[owasp]

13. Moderator Decision Logic

A useful decision matrix is:

AI resultContextRecommended handlingLow confidenceNo repeated targetingAllow or ask user to reviseMedium confidenceTargeted insultWarning and moderator queueHigh confidenceRepeated harassmentHide content and restrict repliesHigh confidenceThreat or doxxingHide immediately and urgent human reviewConflicting model outputsAmbiguous contextHuman review without automatic punishmentCritical safety signalPossible child harm or self-harmSpecialist escalation under a documented procedure

The system should explain the detected pattern, not expose hidden model internals or claim certainty.

14. Development Phases

Phase 1: MVP

Build:

User registration.

Text posting.

Text preprocessing.

Baseline classifier.

Report button.

Moderator queue.

Case decision system.

Basic PostgreSQL schema.

REST APIs.

Audit logging.

Phase 2: Production text moderation

Add:

Multilingual transformer.

Context analysis.

Repetition detection.

Confidence calibration.

Warning-before-posting.

Appeals.

Analytics.

Model registry.

Automated retraining pipeline.

Phase 3: Multimodal moderation

Add:

Image uploads.

OCR.

Screenshot analysis.

Video frame extraction.

Audio transcription.

Multimodal risk aggregation.

Evidence management.

Phase 4: Enterprise and platform integration

Add:

Social-media platform APIs where permitted.

Webhooks.

SSO.

Tenant isolation.

Custom policies.

SLA dashboards.

External moderation APIs.

Compliance exports.

Do not scrape a platform unless its terms, permissions, privacy obligations, and applicable laws allow it; API-based collection is generally preferable when available.[ijirt]

15. Testing Strategy

Functional tests

Login and authorization.

Content submission.

Report creation.

Evidence upload.

Moderator assignment.

Decision and appeal flow.

Account blocking.

Data deletion.

AI tests

Clean content.

Direct insults.

Sarcasm.

Quoted abuse.

Reclaimed slurs.

Code-mixed Kannada-English or Hindi-English.

Emojis and spelling variations.

Screenshots containing abuse.

Repeated harassment.

False reports.

Adversarial obfuscation.

Security tests

Broken object-level authorization.

JWT misuse.

SQL injection.

Prompt or input injection if using an LLM.

Malicious file upload.

Rate-limit bypass.

Privilege escalation.

Data leakage through logs.

Insecure evidence URLs.

Performance targets

Set targets before deployment, for example:

text

Text inference: under 500 ms at normal load
Report creation: under 1 second excluding file upload
Moderator queue refresh: under 2 seconds
Video processing: asynchronous
API availability: 99.9% target
Critical-case notification: near real time

16. Recommended MVP Stack

For a student project or first production prototype:

text

Frontend: React + TypeScript + Tailwind
Backend: FastAPI + Python
Database: PostgreSQL
Queue: Redis + Celery
Model: multilingual transformer using Hugging Face Transformers
Storage: S3-compatible object storage
Authentication: Keycloak or managed OAuth
Deployment: Docker Compose initially, Kubernetes later
Monitoring: Prometheus + Grafana
Testing: Pytest + Playwright + Postman
ML tracking: MLflow

MVP folder structure

text

cyberbullying-platform/
├── frontend/
├── services/
│   ├── api/
│   ├── moderation/
│   ├── inference/
│   ├── preprocessing/
│   └── notification/
├── ml/
│   ├── datasets/
│   ├── training/
│   ├── evaluation/
│   └── model_registry/
├── database/
│   ├── migrations/
│   └── seeds/
├── infrastructure/
│   ├── docker/
│   └── terraform/
├── tests/
└── docs/

17. Important Design Rules

Treat AI output as a recommendation, not unquestionable truth.

Keep human review for high-impact and low-confidence cases.

Train and evaluate separately by language, dialect, and demographic subgroup.

Preserve conversation context while minimizing unnecessary personal data.

Never expose the reporter’s identity to the reported user without a justified reason.

Provide an appeal mechanism.

Record the model version and policy version for every decision.

Make deletion and consent withdrawal operational, not merely documented.

Test the system against adversarial spelling, emojis, code-mixing, and coordinated attacks.

Provide safety and crisis escalation procedures outside the model itself.

Consult legal, child-safety, mental-health, and trust-and-safety specialists before production launch. develop with fully secured platform with all workflow and functions and all pages withall

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4c66eb96-5979-4a0c-8b66-fc47799c7301).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
