import random
import time
from pathlib import Path
from threading import Lock, local
from typing import List, Optional

from curl_cffi import requests


def _normalize_proxy_url(url: str) -> str:
    """Ensure a proxy URL has a scheme."""
    return url if "://" in url else f"http://{url}"


def _build_proxies(
    proxy: Optional[str] = None,
    proxy_http: Optional[str] = None,
    proxy_https: Optional[str] = None,
) -> Optional[dict]:
    if proxy:
        normalized_proxy = _normalize_proxy_url(proxy)
        return {"http": normalized_proxy, "https": normalized_proxy}

    proxies = {}
    if proxy_http:
        proxies["http"] = _normalize_proxy_url(proxy_http)
    if proxy_https:
        proxies["https"] = _normalize_proxy_url(proxy_https)
    return proxies or None


def _load_proxy_list(
    path: str,
    allowed_schemes: Optional[List[str]] = None,
) -> List[dict]:
    """Load a newline-delimited proxy list from a file or URL."""
    try:
        if path.startswith(("http://", "https://")):
            response = requests.get(path, impersonate="chrome123", timeout=30)
            response.raise_for_status()
            lines = response.text.splitlines()
        else:
            lines = Path(path).read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        print(f"Warning: proxy list file not found: {path}")
        return []
    except Exception as error:
        print(f"Warning: failed to load proxy list '{path}': {error}")
        return []

    proxies = []
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        line = line.split(",", 1)[0].split()[0]
        url = _normalize_proxy_url(line)
        if url.startswith("socks5://"):
            url = f"socks5h://{url[len('socks5://'):]}"
        scheme = url.split("://", 1)[0]
        if allowed_schemes is not None and scheme not in allowed_schemes:
            continue
        proxies.append({"http": url, "https": url})
    return proxies


class ProxyRotator:
    """Round-robin proxy rotator with stickiness and failure culling."""

    def __init__(
        self,
        proxies: List[dict],
        rotate_every: int = 1,
        max_failures: int = 2,
        shuffle: bool = False,
    ):
        self.proxies = list(proxies)
        if shuffle:
            random.shuffle(self.proxies)
        self.failures = [0] * len(self.proxies)
        self.rotate_every = max(1, int(rotate_every))
        self.max_failures = max(1, int(max_failures))
        self._index = 0
        self._use_count = 0

    def peek(self) -> Optional[dict]:
        return self.proxies[self._index] if self.proxies else None

    def advance(self) -> None:
        if not self.proxies:
            return
        self._index = (self._index + 1) % len(self.proxies)
        self._use_count = 0

    def size(self) -> int:
        return len(self.proxies)

    def mark_failure_current(self) -> None:
        if not self.proxies:
            return
        self.failures[self._index] += 1
        if self.failures[self._index] < self.max_failures:
            self.advance()
            return

        del self.proxies[self._index]
        del self.failures[self._index]
        if self._index >= len(self.proxies):
            self._index = 0
        self._use_count = 0

    def record_use(self) -> None:
        if not self.proxies:
            return
        self._use_count += 1
        if self._use_count >= self.rotate_every:
            self.advance()


class CourseExplorerClient:
    """Own HTTP sessions, proxy rotation, throttling, retries, and cleanup."""

    def __init__(
        self,
        *,
        worker_count: int,
        proxy: Optional[str] = None,
        proxy_http: Optional[str] = None,
        proxy_https: Optional[str] = None,
        proxy_file: Optional[str] = None,
        rotate_every: int = 1,
        proxy_retries: int = 3,
        request_timeout: int = 30,
        request_delay: float = 0,
        proxy_schemes: Optional[List[str]] = None,
        insecure: bool = False,
        proxy_try_all: bool = False,
        max_proxy_failures: int = 2,
        proxy_shuffle: bool = False,
        verbose: bool = False,
    ):
        self.proxies = _build_proxies(proxy, proxy_http, proxy_https)
        proxy_list = (
            _load_proxy_list(proxy_file, proxy_schemes) if proxy_file else []
        )
        self.rotator = (
            ProxyRotator(
                proxy_list,
                rotate_every=rotate_every,
                max_failures=max_proxy_failures,
                shuffle=proxy_shuffle,
            )
            if proxy_list
            else None
        )
        self.worker_count = max(1, int(worker_count))
        if self.rotator and self.worker_count > 1:
            print("Proxy rotation enabled; using one request worker")
            self.worker_count = 1

        self.proxy_retries = max(1, int(proxy_retries))
        self.request_timeout = request_timeout
        self.request_delay = request_delay
        self.insecure = insecure
        self.proxy_try_all = proxy_try_all
        self.verbose = verbose
        self._session_local = local()
        self._session_lock = Lock()
        self._sessions = []
        self._request_slot_lock = Lock()
        self._next_request_at = 0.0

    def _session(self):
        session = getattr(self._session_local, "session", None)
        if session is None:
            session = requests.Session(impersonate="chrome123")
            self._session_local.session = session
            with self._session_lock:
                self._sessions.append(session)
        return session

    def _wait_for_request_slot(self) -> None:
        if self.request_delay <= 0:
            return
        with self._request_slot_lock:
            now = time.monotonic()
            if self._next_request_at > now:
                time.sleep(self._next_request_at - now)
            self._next_request_at = (
                time.monotonic()
                + self.request_delay
                + random.uniform(0, self.request_delay * 0.25)
            )

    def fetch(self, url: str):
        if self.rotator and self.rotator.size() == 0:
            raise RuntimeError("No proxies left in rotation")

        attempts = (
            self.rotator.size()
            if self.rotator and self.proxy_try_all
            else self.proxy_retries
        )
        last_error = None
        for attempt in range(1, attempts + 1):
            if self.rotator and self.rotator.size() == 0:
                break
            request_proxies = self.rotator.peek() if self.rotator else self.proxies
            self._wait_for_request_slot()
            try:
                response = self._session().get(
                    url,
                    proxies=request_proxies,
                    timeout=self.request_timeout,
                    verify=not self.insecure,
                )
                response.raise_for_status()
                if self.rotator:
                    self.rotator.record_use()
                return response
            except KeyboardInterrupt:
                raise
            except Exception as error:
                last_error = error
                failed_response = getattr(error, "response", None)
                status_code = getattr(failed_response, "status_code", None)
                if self.verbose or status_code in {403, 429}:
                    print(
                        f"  Request failed (attempt {attempt}/{attempts}, "
                        f"status {status_code or 'unknown'}): {error}"
                    )
                if self.rotator:
                    self.rotator.mark_failure_current()
                if attempt < attempts:
                    retry_after = getattr(failed_response, "headers", {}).get(
                        "Retry-After"
                    )
                    try:
                        backoff = min(60.0, max(0.0, float(retry_after)))
                    except (TypeError, ValueError):
                        backoff = min(60, 2**attempt)
                    time.sleep(backoff + random.uniform(0, 1))

        raise last_error or RuntimeError("Unknown request error")

    def close(self) -> None:
        for session in self._sessions:
            session.close()
        self._sessions.clear()
