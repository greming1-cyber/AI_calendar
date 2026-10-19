"use server";

import { revokeAllGoogleTokens } from "@/lib/google/server";
import { createAdminClient } from "./admin";
import { createClient } from "./server";

// "use server" 파일은 async 함수만 내보낼 수 있다. 화면(ProfileTab)도 같은 문구를 쓴다.
const DELETE_CONFIRM_TEXT = "탈퇴";

/**
 * AUTH-05: 회원 탈퇴. 로그인한 본인만 지울 수 있다.
 * auth.users를 지우면 모든 사용자 테이블이 on delete cascade로 지워지고,
 * google_accounts 삭제 트리거가 Vault의 refresh token도 지운다. 그 전에 구글 쪽 토큰을 폐기한다.
 */
export async function deleteAccount(confirmText: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (confirmText.trim() !== DELETE_CONFIRM_TEXT) {
    return { ok: false, message: `확인란에 "${DELETE_CONFIRM_TEXT}"를 입력해 주세요.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, message: "로그인이 필요해요." };

  await revokeAllGoogleTokens(data.user.id).catch(() => undefined);
  const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(data.user.id);
  if (deleteError) return { ok: false, message: "탈퇴 처리에 실패했어요. 잠시 뒤 다시 시도해 주세요." };

  // 이미 사용자가 없으므로 세션 쿠키만 지운다.
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
