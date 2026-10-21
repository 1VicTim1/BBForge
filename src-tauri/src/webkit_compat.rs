//! Compatibility for WebKitGTK 4.1 builds older than 2.40, as shipped by RED OS 8.
//!
//! Wry links three 2.40 entry points even when the application never uses request
//! bodies or cookie enumeration. Returning an empty body/cookie list preserves the
//! behavior BBForge needs while allowing the loader to start on those systems.

use std::{ffi::c_void, ptr};

type AsyncReadyCallback = unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void);

#[unsafe(no_mangle)]
unsafe extern "C" fn webkit_uri_scheme_request_get_http_body(_request: *mut c_void) -> *mut c_void {
    ptr::null_mut()
}

#[unsafe(no_mangle)]
unsafe extern "C" fn webkit_cookie_manager_get_all_cookies(
    cookie_manager: *mut c_void,
    _cancellable: *mut c_void,
    callback: Option<AsyncReadyCallback>,
    user_data: *mut c_void,
) {
    if let Some(callback) = callback {
        unsafe { callback(cookie_manager, ptr::null_mut(), user_data) };
    }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn webkit_cookie_manager_get_all_cookies_finish(
    _cookie_manager: *mut c_void,
    _result: *mut c_void,
    error: *mut *mut c_void,
) -> *mut c_void {
    if !error.is_null() {
        unsafe { *error = ptr::null_mut() };
    }
    ptr::null_mut()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    static CALLED: AtomicBool = AtomicBool::new(false);

    unsafe extern "C" fn callback(
        _source: *mut c_void,
        _result: *mut c_void,
        _user_data: *mut c_void,
    ) {
        CALLED.store(true, Ordering::SeqCst);
    }

    #[test]
    fn old_webkit_fallbacks_return_empty_values_without_blocking() {
        let mut error = 1usize as *mut c_void;
        unsafe {
            assert!(webkit_uri_scheme_request_get_http_body(ptr::null_mut()).is_null());
            webkit_cookie_manager_get_all_cookies(
                ptr::null_mut(),
                ptr::null_mut(),
                Some(callback),
                ptr::null_mut(),
            );
            assert!(
                webkit_cookie_manager_get_all_cookies_finish(
                    ptr::null_mut(),
                    ptr::null_mut(),
                    &mut error,
                )
                .is_null()
            );
        }
        assert!(CALLED.load(Ordering::SeqCst));
        assert!(error.is_null());
    }
}
