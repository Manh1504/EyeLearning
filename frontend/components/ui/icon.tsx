// components/ui/icon.tsx — Icon Remix dùng chung.
// Trả về component SVG @remixicon/react qua tên class kiểu cũ (ri-*) để
// các file chuyển dần mà không cần đổi import từng icon.
'use client';

import { type ComponentType } from 'react';
import {
  RiAddLine, RiArrowDownSLine, RiArrowLeftLine, RiArrowLeftSLine, RiArrowRightLine,
  RiArrowRightSLine, RiBarChartBoxLine, RiBarChartLine, RiBookOpenLine,
  RiCalendarLine, RiCheckboxBlankCircleLine, RiCheckboxCircleFill, RiCheckboxCircleLine,
  RiCheckLine, RiCloseLine, RiDashboardLine, RiDeleteBinLine, RiDraggable, RiEditLine,
  RiErrorWarningLine, RiEyeLine, RiEyeOffLine, RiFireLine, RiFocus2Line,
  RiFolderLine, RiGitBranchLine, RiGroupLine, RiIdCardLine, RiImageLine, RiInboxLine,
  RiInformationLine, RiLayoutLeftLine, RiListCheck3, RiLockLine, RiLogoutBoxRLine,
  RiMailLine, RiMore2Fill, RiPhoneLine, RiQuestionLine, RiRocket2Line, RiSearchLine, RiSeedlingLine,
  RiSlideshow3Line, RiStackLine, RiUploadCloud2Line, RiUserAddLine, RiUserFollowLine,
  RiUserLine, RiVipDiamondLine,
} from '@remixicon/react';

const RICON: Record<string, ComponentType<{ className?: string }>> = {
  'ri-add-line': RiAddLine,
  'ri-arrow-down-s-line': RiArrowDownSLine,
  'ri-arrow-left-line': RiArrowLeftLine,
  'ri-arrow-left-s-line': RiArrowLeftSLine,
  'ri-arrow-right-line': RiArrowRightLine,
  'ri-arrow-right-s-line': RiArrowRightSLine,
  'ri-bar-chart-box-line': RiBarChartBoxLine,
  'ri-bar-chart-line': RiBarChartLine,
  'ri-book-open-line': RiBookOpenLine,
  'ri-calendar-line': RiCalendarLine,
  'ri-checkbox-blank-circle-line': RiCheckboxBlankCircleLine,
  'ri-checkbox-circle-fill': RiCheckboxCircleFill,
  'ri-checkbox-circle-line': RiCheckboxCircleLine,
  'ri-check-line': RiCheckLine,
  'ri-close-line': RiCloseLine,
  'ri-dashboard-line': RiDashboardLine,
  'ri-delete-bin-line': RiDeleteBinLine,
  'ri-draggable': RiDraggable,
  'ri-edit-line': RiEditLine,
  'ri-error-warning-line': RiErrorWarningLine,
  'ri-eye-line': RiEyeLine,
  'ri-eye-off-line': RiEyeOffLine,
  'ri-fire-line': RiFireLine,
  'ri-focus-2-line': RiFocus2Line,
  'ri-folder-line': RiFolderLine,
  'ri-git-branch-line': RiGitBranchLine,
  'ri-group-line': RiGroupLine,
  'ri-id-card-line': RiIdCardLine,
  'ri-image-line': RiImageLine,
  'ri-inbox-line': RiInboxLine,
  'ri-information-line': RiInformationLine,
  'ri-layout-left-line': RiLayoutLeftLine,
  'ri-list-check-3': RiListCheck3,
  'ri-lock-line': RiLockLine,
  'ri-logout-box-r-line': RiLogoutBoxRLine,
  'ri-mail-line': RiMailLine,
  'ri-more-2-fill': RiMore2Fill,
  'ri-phone-line': RiPhoneLine,
  'ri-question-line': RiQuestionLine,
  'ri-rocket-2-line': RiRocket2Line,
  'ri-search-line': RiSearchLine,
  'ri-seedling-line': RiSeedlingLine,
  'ri-slideshow-3-line': RiSlideshow3Line,
  'ri-stack-line': RiStackLine,
  'ri-upload-cloud-2-line': RiUploadCloud2Line,
  'ri-user-add-line': RiUserAddLine,
  'ri-user-follow-line': RiUserFollowLine,
  'ri-user-line': RiUserLine,
  'ri-vip-diamond-line': RiVipDiamondLine,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = RICON[name];
  return C ? <C className={className} /> : null;
}
