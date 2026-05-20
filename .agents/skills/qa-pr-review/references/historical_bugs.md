# Historical Bugs — Cynch QA

This document contains recurrent and high-impact bugs previously found in production.
These bugs must be considered during PR analysis and test design **only when the current changes intersect with the affected areas or patterns described below**.

---

## 1. CSV Export — Filters, Pagination & Background Processes

### Area
- Export as CSV
- Filters & Pagination
- Background Requests & Error Handling
- Empty States

### Historical Issues
- CSV export ignores newly added filters and downloads the full dataset.
- CSV export breaks when triggered while the UI focus is on a page greater than 1.
  - Root cause: CSV generation iterates paginated pages starting from the current page instead of page 1.
- Cancelling a CSV download fails to abort background requests, resulting in the file eventually downloading anyway.
- CSV generation fails silently if a request fails mid-process, ignoring the standard retry logic (up to 5 retries) before displaying an error message.
- CSV download button remains enabled even when the list or table has no results, allowing the download of empty files.

### Activation Signals
- Changes related to:
  - CSV export logic and file generation
  - Filters applied to lists or tables
  - Pagination behavior
  - Abort controllers, request cancellation, or background tasks
  - Error handling or retry mechanisms for network requests
  - Table/List empty states

### Expected Coverage
- Regression tests validating:
  - CSV export strictly respects active filters and always starts from page 1.
  - Cancelling the export immediately aborts all background network requests and prevents the file download.
  - Network failures during export trigger the standard 5-retry logic before showing an explicit error message.
  - The "Download as CSV" button is explicitly disabled when there are no results displayed on the UI.

---

## 2. Filters — URL Sharing (Query Params)

### Area
- Filters
- URL state management

### Historical Issues
- Filters applied in the UI do not update query parameters.
- Filtered views cannot be shared via URL due to missing query params.

### Activation Signals
- Changes related to:
  - Filters
  - Routing
  - URL generation
  - Query parameter handling

### Expected Coverage
- Regression tests validating:
  - Filters are reflected in query parameters
  - Shared URLs restore filtered state correctly

---

## 3. Buttons — Multiple Click Prevention

### Area
- UI Actions
- Forms
- Payments

### Historical Issues
- Action buttons (e.g. "Pay") can be clicked multiple times.
- Buttons are not disabled after the first interaction, causing duplicate actions.

### Activation Signals
- Changes related to:
  - Buttons triggering API calls
  - Payments
  - Submissions
  - Reload or refresh actions

### Expected Coverage
- Regression tests validating:
  - Buttons are disabled after first click
  - Multiple submissions are prevented

---

## 4. Buttons as Links — Incorrect Redirection

### Area
- UI Navigation
- External/Internal Links

### Historical Issues
- Buttons visually react but redirect to incorrect URLs.
- URLs contain empty or invalid GUIDs due to incorrect variable declaration.
- Redirection results in navigation errors or broken pages.

### Activation Signals
- Changes related to:
  - Buttons acting as links
  - `open in new tab`
  - URL construction
  - Route parameters (GUIDs)

### Expected Coverage
- Regression tests validating:
  - Correct URL generation
  - Valid GUID presence in the URL
  - Successful navigation

---

## 5. Assignments — Behavior & Filters

### Area
- Assignments
- Filters by assignment

### Historical Issues
- When modifying any part of the assignment behavior, the associated filters frequently break or lose accuracy.
- Historical data shows that changes to the assignment logic often result in regressions where the "Filter by Assignment" functionality no longer returns precise results.

### Activation Signals
- Changes related to:
  - Assignment or re-assignment logic
  - Functional behavior of assignment components
  - Modifications to assigned task workflows

### Expected Coverage
- Regression tests validating:
  - The core functional behavior of the assignment itself
  - The integrity of assignment-based filters, ensuring they accurately reflect state changes
  - Impact analysis on all linked filtering components to ensure no regressions occurred

---

## 6. Dates and Timezones — Offsets & Explicit Input

### Area
- Dates and Times
- Organization Timezone Settings
- Date Pickers & Forms
- Audit Logs / Automated Timestamps

### Historical Issues
- Auto-generated timestamps fail to apply the organization's timezone offset correctly to the base server time in two distinct ways:
  1. **Ignored Offset:** The offset is not applied at all, and the record is saved using the base server time (e.g., Server time is 5:00 PM, Org time is 3:00 PM -> saves as 5:00 PM).
  2. **Multiple Applications:** The offset is applied more than once during the saving process, compounding the shift (e.g., A -2 hour offset is applied twice to a 5:00 PM server time -> erroneously saves as 1:00 PM).
- Manually entered exact dates/times incorrectly apply an offset under the hood, shifting the user's intended input to a different day/time (e.g., user inputs "Feb 12 at 12:00 AM" and the system erroneously saves it as "Feb 11 at 10:00 PM").

### Activation Signals
- Changes related to:
  - Date/time input fields and date-pickers
  - Organization timezone settings and offset configurations
  - Automated record logging (e.g., audit trails, action timestamps)
  - Date formatting, parsing, or serialization logic

### Expected Coverage
- Regression tests validating:
  - **Automated Records:** Automatic timestamps apply the organization's timezone offset *exactly once* to the server time, ensuring the precise organization time is recorded without missing or duplicating the calculation.
  - **Explicit Inputs:** Manually entered dates and times are saved and displayed exactly as the user submitted them, without applying any timezone offset modifications that alter the raw value.

---

## 7. Navigation — Leave During Load (Stale Async / Post-Destroy Navigation)

### Area
- Route changes and in-app navigation (including switching to another main area or "tab" in the shell while content is still loading)
- Component lifecycle (`ngOnDestroy`, teardown subjects, `takeUntil`)
- Async completion handlers (HTTP/WebSocket callbacks, `Router.navigate`, `updateQueryParams`, timers, debounced work) that run after the user has already left the view

### Historical Issues
- The user navigates away from a page (or another shell tab) while the page is **still loading** or while **in-flight requests** have not completed; when those operations finish, a **late** `Router.navigate`, query-param sync, or similar side effect runs and **returns the user to the page they intended to leave** (navigation loop or "snap back").
- The pattern has appeared across **multiple components** sharing the same root cause: subscriptions or callbacks not tied to teardown, or navigation helpers not checking that the component is still active.
- Related symptom: rapid switching between two routes that reuse the same component causes a **bounce** between URLs until load/teardown order stabilizes.

### Activation Signals
- Changes related to:
  - Subscriptions to `ActivatedRoute`, `queryParams`, or route data without `takeUntil` / equivalent teardown
  - `Router.navigate` or query-string updates triggered from service callbacks, `subscribe` blocks, or `setTimeout` / debounce completion
  - Fixes that add `isDestroyed` flags, `takeUntil(destroy$)`, `clearTimeout` / `clearInterval` in `ngOnDestroy`, or guards that skip navigation after destroy
  - Initial load sequences that chain multiple async steps before the view is stable

### Expected Coverage
- Regression tests validating:
  - **Leave during load:** While the list or screen is still loading (spinner or equivalent), navigate away to another route or shell tab; the app **must remain** on the destination the user chose, with **no** automatic navigation back to the previous view when loading completes.
  - **Rapid exit:** Repeat with slow or throttled network so responses complete **after** the user has already left; still no snap-back or URL fight.
  - **Teardown order:** Where the fix adds destroy guards, confirm that legitimate in-view behavior (filters updating the URL, pagination) still works when the user **stays** on the page.
