# Issue 7: Add a new skills section to the end of the README.md

## Summary
A new section must be added to the end of the `README.md` file to inform users that the Docker MCP profile must be configured prior to using the CLI.

## Requirements
*   The `README.md` file must be updated to include a new section.
*   This new section must explicitly state the prerequisite that the Docker MCP profile needs to be configured before the CLI can be used.

## Acceptance Criteria
*   The `README.md` file contains a clearly visible section detailing prerequisites for CLI usage.
*   The content of this section accurately communicates the requirement to configure the Docker MCP profile first.

## Test Expectations
*   Verify that the `README.md` file has been modified.
*   Navigate to the end of the `README.md` and confirm the presence of the prerequisite warning regarding the Docker MCP profile configuration.

## Out of Scope
*   Implementing the actual configuration steps for the Docker MCP profile.
*   Modifying any other part of the documentation besides the addition of this specific prerequisite section.

## Implementation Notes
*   The new section should be placed at the very end of the existing `README.md` content.
*   The wording should be clear and directive (e.g., "Prerequisite," "Note," or "Important").
*   *Assumption: The term "Docker MCP profile" is understood by the target audience of this repository.*
