import { useCallback, useEffect, useState } from "react";

// 라이트/다크 테마. 기본은 예전과 같이 OS 설정을 그대로 따르고, 시작 화면의
// 버튼으로 한 번 고르면 그 선택이 localStorage에 남아 OS 설정을 덮는다.
//
// 실제 색은 index.css 등의 html[data-theme="dark"] 블록이 정한다 - 여기서는 그
// 속성만 붙인다. 첫 페인트 전에 같은 판단을 index.html의 인라인 스크립트가 한 번
// 더 하는데(테마가 늦게 붙으면 화면이 한 번 번쩍인다), 두 곳의 규칙이 어긋나지
// 않게 키 이름과 우선순위(저장값 > OS)를 아래 상수/주석과 같이 맞춰 둔다.
export const THEME_STORAGE_KEY = "planet-keeper-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const systemTheme = () =>
  typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";

/** 저장된 선택(없으면 null). 잘못된 값이 들어 있으면 없는 것으로 본다. */
function storedTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    // 시크릿 모드 등에서 localStorage 접근이 막히면 그냥 OS 설정을 따른다.
    return null;
  }
}

export default function useTheme() {
  // 저장된 선택이 있으면 그것, 없으면 OS 설정.
  const [override, setOverride] = useState(storedTheme);
  const [system, setSystem] = useState(systemTheme);
  const theme = override ?? system;

  // 선택을 안 했을 때만 OS 설정을 따라간다 - 사용자가 고른 뒤에는 OS가 바뀌어도
  // 화면이 제멋대로 뒤집히지 않아야 한다.
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e) => setSystem(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setOverride((prev) => {
      const next = (prev ?? systemTheme()) === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // 저장이 막혀도 이번 세션에서는 바뀐 테마가 유지된다.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
