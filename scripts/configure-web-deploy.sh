#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != --apply ) ]]; then
    echo 'Usage: configure-web-deploy.sh [--apply]' >&2
    exit 2
fi

PROJECT=lightning-202103
REPOSITORY=bvolpato/far-aim-online
BUCKET=gs://faraim.online
SERVICE_ACCOUNT="far-aim-online-web-deploy@$PROJECT.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
POOL="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/far-aim-online-github"
PROVIDER="$POOL/providers/github"
PRINCIPAL="principalSet://iam.googleapis.com/$POOL/attribute.repository_id/1415917218"
EXPECTED_CONDITION="assertion.repository_id == '1415917218' && assertion.repository_owner_id == '3207647' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'bvolpato/far-aim-online/.github/workflows/web-ci.yml@refs/heads/main' && assertion.event_name in ['push', 'workflow_dispatch']"
EXPECTED_MAPPING='{"attribute.event_name":"assertion.event_name","attribute.ref":"assertion.ref","attribute.repository_id":"assertion.repository_id","attribute.repository_owner_id":"assertion.repository_owner_id","attribute.workflow_ref":"assertion.workflow_ref","google.subject":"assertion.sub"}'

provider_json="$(gcloud iam workload-identity-pools providers describe github \
    --project="$PROJECT" --location=global --workload-identity-pool=far-aim-online-github \
    --format=json)"
if ! jq -e \
    --arg provider "$PROVIDER" \
    --arg condition "$EXPECTED_CONDITION" \
    --argjson mapping "$EXPECTED_MAPPING" \
    '.name == $provider and .state == "ACTIVE" and .oidc.issuerUri == "https://token.actions.githubusercontent.com" and .attributeCondition == $condition and .attributeMapping == $mapping' \
    <<<"$provider_json" >/dev/null; then
    echo 'The workload identity provider does not match the expected active repository, workflow, ref, and event restrictions.' >&2
    exit 1
fi

GH_CONFIG_DIR="$HOME/.config/gh-personal"
export GH_CONFIG_DIR

if [[ "${1:-}" != --apply ]]; then
    printf 'Deploy identity: %s\nTrusted repository identity: %s\nWorkload identity provider: %s\nBucket: %s\nRoles: roles/storage.objectUser, roles/storage.bucketViewer\n' \
        "$SERVICE_ACCOUNT" "$PRINCIPAL" "$PROVIDER" "$BUCKET"
    echo 'Run with --apply to create the identity, grant access, and set repository variables.'
    exit 0
fi

gh auth status --hostname github.com >/dev/null

existing_account="$(gcloud iam service-accounts list --project="$PROJECT" \
    --filter="email=$SERVICE_ACCOUNT" --format='value(email)')"
if [[ -z "$existing_account" ]]; then
    gcloud iam service-accounts create far-aim-online-web-deploy --project="$PROJECT" \
        --display-name='FAR/AIM website deployment'
fi

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
    --project="$PROJECT" --role=roles/iam.workloadIdentityUser \
    --member="$PRINCIPAL" --condition=None >/dev/null
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
    --member="serviceAccount:$SERVICE_ACCOUNT" --role=roles/storage.objectUser >/dev/null
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
    --member="serviceAccount:$SERVICE_ACCOUNT" --role=roles/storage.bucketViewer >/dev/null

gh variable set GCP_PROJECT_ID --repo "$REPOSITORY" --body "$PROJECT"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$REPOSITORY" --body "$PROVIDER"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "$REPOSITORY" --body "$SERVICE_ACCOUNT"
echo 'Configured keyless main-branch deployment and repository variables.'
