---
description: How to create a new D&D campaign using the dnd-campaign-creator tool
---

This workflow defines how to initialize a brand new D&D campaign repository that leverages the generic `dnd-campaign-creator` toolkit via local npm linking.

1. **Verify Base Toolkit**: Ensure that `/Users/robertgilks/Source/dnd-campaign-creator` exists and is a valid NPM project.
2. **Create Campaign Directory**:
   // turbo
   `mkdir -p <PATH_TO_NEW_CAMPAIGN> && cd <PATH_TO_NEW_CAMPAIGN> && npm init -y`
3. **Install the Toolkit**: Link the base toolkit using NPM local file installation.
   // turbo
   `cd <PATH_TO_NEW_CAMPAIGN> && npm install file:/Users/robertgilks/Source/dnd-campaign-creator`
4. **Scaffold Directory Structure**:
   // turbo-all
   - `mkdir -p <PATH_TO_NEW_CAMPAIGN>/adventures/my-first-adventure`
   - `mkdir -p <PATH_TO_NEW_CAMPAIGN>/assets`
   - `cp /Users/robertgilks/Source/dnd-campaign-creator/campaign.example.json <PATH_TO_NEW_CAMPAIGN>/campaign.json`
5. **Initial Configuration**:
   - Edit the newly created `campaign.json` file in the new campaign repository.
   - Update `campaignRoot` to `.`
   - Update `assetsDir` to `./assets`
   - Update the adventure key, title, and target Google Doc ID.
6. **Create Placeholder Content**:
   - Create a `00-adventure-guide.md` file in the adventure source directory defined in the `campaign.json`.
7. **Test Local CLI**:
   - Run `npx campaign-creator --help` inside the new campaign repository to ensure the bin script is successfully linked and executable.
