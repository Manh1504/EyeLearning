# ELA Design System

## Nguyên Tắc
- Ưu tiên tính học thuật, tin cậy và rõ ràng hơn là hiệu ứng thị giác.
- Mỗi màn hình chỉ nên có một mục tiêu chính và một CTA nổi bật.
- Không dùng nhiều gradient, badge viết hoa, nền chấm hoặc card lồng card nếu không có lý do nghiệp vụ.
- Không truyền tải trạng thái chỉ bằng màu sắc; luôn có nhãn, mô tả hoặc icon phụ trợ.
- UI phải khác nhau theo role, nhưng vẫn dùng chung token và component.

## Color Palette
### Primary
- `primary-900` `#073B5C`
- `primary-800` `#095078`
- `primary-700` `#08689A`
- `primary-600` `#087FB5`
- `primary-500` `#1596C8`
- `primary-100` `#DFF3FA`
- `primary-50` `#F0F9FC`

### Neutral
- `neutral-950` `#101828`
- `neutral-900` `#172033`
- `neutral-700` `#344054`
- `neutral-600` `#475467`
- `neutral-500` `#667085`
- `neutral-300` `#D0D5DD`
- `neutral-200` `#E4E7EC`
- `neutral-100` `#F2F4F7`
- `neutral-50` `#F8FAFC`
- `white` `#FFFFFF`

### Semantic
- `success` `#16855B`
- `warning` `#C87512`
- `error` `#C9362B`
- `info` `#1677A8`

### Usage Rules
- Use one primary blue per screen, not multiple saturated blues.
- Use semantic colors only for badges, alerts, validation, status, and meaningful chart signals.
- Keep contrast at WCAG AA minimum.

## Typography Scale
- Display: `48 / 56 / 700` only for landing pages.
- Heading 1: `36 / 44 / 700`.
- Heading 2: `28 / 36 / 700`.
- Heading 3: `22 / 30 / 600`.
- Heading 4: `18 / 26 / 600`.
- Body large: `16 / 26 / 400`.
- Body: `14 / 22 / 400`.
- Label: `13 / 20 / 600`.
- Caption: `12 / 18 / 400`.

### Usage Rules
- Avoid oversized headings in operational screens.
- Avoid all-caps labels unless the label is a technical tag or system code.
- Keep line length readable, roughly 55-75 characters.
- Avoid excessive font-weight variation in a single screen.

## Spacing Scale
Use only these steps unless there is a clear reason:
- `4px`
- `8px`
- `12px`
- `16px`
- `20px`
- `24px`
- `32px`
- `40px`
- `48px`
- `64px`
- `80px`

## Border Radius
- `radius-sm`: `6px`
- `radius-md`: `8px`
- `radius-lg`: `12px`
- `radius-xl`: `16px`

### Usage Rules
- Inputs and buttons use `8px`.
- Standard cards use `12px`.
- Large modals or major panels use `16px`.
- Avoid overly round, mobile-app-like pills unless a chip or badge is intended.

## Shadow
- `shadow-sm`: for dropdowns and tooltips.
- `shadow-md`: for modals or floating panels.
- Use borders before shadows for standard cards.
- Avoid glow effects and floating-card styling.

## Component Variants
### Button
Variants: `primary`, `secondary`, `outline`, `ghost`, `danger`
Sizes: `sm`, `md`, `lg`
States: default, hover, focus, active, disabled, loading

### Input
Must include:
- label
- input
- helper text
- error message
- required indicator
- disabled state
- password visibility toggle when relevant

Default height: `44-48px`.

### Select, Dropdown, Combobox
- Match input height.
- Support loading, empty, and no results states.
- Prefer custom components if the page already uses them.

### Card
Use different card treatments for:
- content
- metric
- course
- analytics
- warning

### Table
Must standardize:
- header
- row height
- hover state
- sorting
- filter
- pagination
- empty state
- loading skeleton
- horizontal scroll
- sticky header when needed

### Badge and Status
Semantic usage examples:
- Đang học
- Đã hoàn thành
- Chưa hiệu chỉnh
- Calibration không đạt
- Đang xử lý
- Đã lưu

### Modal and Drawer
- Modal: confirm or short tasks.
- Drawer: filter or detail panels.
- Use a page instead of a modal for multi-step workflows.

### Feedback States
Shared patterns:
- loading spinner
- skeleton
- empty state
- error state
- success toast
- warning alert
- confirmation dialog

## Button Usage
- Use one primary action per section.
- Use action-specific verbs: `Đăng nhập`, `Lưu`, `Bắt đầu học`, `Hiệu chỉnh lại`.
- Avoid generic CTAs like `Tiếp tục` when the action is specific.
- Keep focus rings visible and consistent.

## Form Usage
- Put the label outside the control.
- Use helper text for guidance, not placeholder text.
- Do not place production-only instructions inside placeholders.
- Show validation errors inline, close to the field.
- Keep form width readable, usually `400-440px` for auth forms.

## Card Usage
- Prefer border over heavy shadow.
- Use cards to group related data, not to decorate the page.
- Keep metric cards compact.
- Keep analytics cards dense and information-first.

## Table Usage
- Always include readable headers.
- Use row hover to signal interactability.
- Show an empty state when there are no rows.
- Add horizontal scroll instead of forcing columns to shrink too much.

## Icon Rules
- Use icons only when they clarify meaning.
- Do not use emoji as icons.
- Icon buttons must have ARIA labels.
- Avoid mixing icon styles in the same screen.

## Responsive Rules
- Design for `1280px`, `1024px`, `768px`, and mobile.
- Collapse sidebars into drawers on smaller screens.
- Convert wide data tables to horizontally scrollable containers.
- On auth screens, show the full split layout on desktop and only the form on mobile.
- Do not shrink desktop layouts without rethinking spacing and hierarchy.

## Accessibility Rules
- Maintain keyboard navigation for every interactive control.
- Keep a visible focus state.
- Use real labels for inputs.
- Keep contrast at WCAG AA.
- Never rely on color alone to communicate a state.
- Make tap targets at least `40-44px` tall.

## Good vs Bad
### Good
- `Đăng nhập` on the login button.
- A single blue primary CTA and neutral secondary actions.
- A table with header, hover state, and empty state.
- A calibration result that says `Nên hiệu chỉnh lại` instead of only showing red.

### Bad
- `Tiếp tục` when the action is clearly `Đăng nhập`.
- A form placeholder that says `Có thể để trống trong môi trường dev`.
- Multiple saturated blue tones on one screen.
- A badge that uses color but has no text label.

## New Page Checklist
- [ ] Use the shared tokens instead of hard-coded colors or random spacing.
- [ ] Pick the correct layout for the role and page type.
- [ ] Keep one primary CTA per section.
- [ ] Add labels, helper text, and error states for forms.
- [ ] Add empty/loading states for data-driven views.
- [ ] Check contrast and keyboard focus.
- [ ] Verify role navigation does not expose unauthorized links.
- [ ] Confirm the page works at desktop, tablet, and mobile widths.
- [ ] Reuse existing components before adding new patterns.
