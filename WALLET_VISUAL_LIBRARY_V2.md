# Wallet Visual Library v2

Builds on the repaired Sprint-9 Wallet baseline without changing migrations 0008/0009.

## Server
- additive migration `0010_wallet_visual_capture.sql`
- optional source image/page title fields
- best-effort metadata preview at `POST /wallet/preview`
- preview fetch blocks private/local addresses and revalidates redirects
- existing workspace/module middleware remains authoritative

## Frontend
- Wallet opens as inspiration library, not capture form
- grid/list switch, search, source/period/status filters and sorting
- capture/edit dialog with optional automatic source preview
- card/list main click opens original source
- secondary three-dot actions: Food Moment handoff, recipe handoff, edit, archive, delete
- capture date remains server-generated (`saved_at`)
- service-worker cache bumped to v33

## Architecture
Wallet stays the owner only of captured inspiration metadata. Recipe/Food-Moment creation is initiated as context handoff; target modules remain owners of their own domain data.
