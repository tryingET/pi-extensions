#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <node_api.h>
#include <stdlib.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

typedef struct {
  int fd;
  int locked;
  dev_t dev;
  ino_t ino;
} mutex;
static napi_value fail(napi_env e, const char *s) {
  napi_throw_error(e, NULL, s);
  return NULL;
}
static napi_value undef(napi_env e) {
  napi_value v;
  napi_get_undefined(e, &v);
  return v;
}
static void finalize(napi_env e, void *p, void *hint) {
  (void)e;
  (void)hint;
  mutex *m = p;
  /* Closing is only namespace mutex cleanup, never AK explicit unlock. */
  if (m->fd >= 0)
    close(m->fd);
  free(m);
}
static mutex *arg(napi_env e, napi_callback_info info) {
  size_t n = 1;
  napi_value a;
  void *p = NULL;
  napi_get_cb_info(e, info, &n, &a, NULL, NULL);
  if (n != 1 || napi_get_value_external(e, a, &p) != napi_ok || !p) {
    fail(e, "native_handle_required");
    return NULL;
  }
  return p;
}
static napi_value open_mutex(napi_env e, napi_callback_info info) {
  size_t n = 1, len;
  napi_value a;
  char path[4096];
  napi_get_cb_info(e, info, &n, &a, NULL, NULL);
  if (n != 1 ||
      napi_get_value_string_utf8(e, a, path, sizeof(path), &len) != napi_ok ||
      len >= sizeof(path) - 1)
    return fail(e, "invalid_lock_path");
  int fd = open(path, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
  struct stat s;
  if (fd < 0)
    return fail(e, "lock_open_failed");
  if (fstat(fd, &s) || !S_ISREG(s.st_mode) || (s.st_mode & 0777) != 0600 ||
      s.st_uid != getuid() || s.st_nlink != 1) {
    close(fd);
    return fail(e, "lock_identity_invalid");
  }
  mutex *m = calloc(1, sizeof(mutex));
  if (!m) {
    close(fd);
    return fail(e, "allocation_failed");
  }
  m->fd = fd;
  m->dev = s.st_dev;
  m->ino = s.st_ino;
  napi_value v;
  napi_create_external(e, m, finalize, NULL, &v);
  return v;
}
static napi_value identity(napi_env e, napi_callback_info info) {
  mutex *m = arg(e, info);
  if (!m)
    return NULL;
  napi_value out, dev, ino;
  napi_create_object(e, &out);
  napi_create_double(e, (double)m->dev, &dev);
  napi_create_double(e, (double)m->ino, &ino);
  napi_set_named_property(e, out, "dev", dev);
  napi_set_named_property(e, out, "ino", ino);
  return out;
}
static napi_value try_lock(napi_env e, napi_callback_info info) {
  mutex *m = arg(e, info);
  if (!m)
    return NULL;
  if (m->fd < 0 || m->locked)
    return fail(e, "invalid_lock_phase");
  int r = flock(m->fd, LOCK_EX | LOCK_NB);
  if (r && errno != EWOULDBLOCK)
    return fail(e, "flock_failed");
  m->locked = r == 0;
  napi_value v;
  napi_get_boolean(e, m->locked, &v);
  return v;
}
static napi_value unlock(napi_env e, napi_callback_info info) {
  mutex *m = arg(e, info);
  if (!m)
    return NULL;
  if (m->fd < 0 || !m->locked || flock(m->fd, LOCK_UN))
    return fail(e, "invalid_unlock_phase");
  m->locked = 0;
  return undef(e);
}
static napi_value close_mutex(napi_env e, napi_callback_info info) {
  mutex *m = arg(e, info);
  if (!m)
    return NULL;
  if (m->locked)
    return fail(e, "close_locked_mutex");
  if (m->fd >= 0) {
    close(m->fd);
    m->fd = -1;
  }
  return undef(e);
}
static int custody = 0;
static int custody_fd = 1;
static int detached = 0;
static napi_value adopt(napi_env e, napi_callback_info info) {
  (void)info;
  struct stat a, b;
  int type;
  socklen_t l = sizeof(type);
  /* Fixed producer stdio map. No public or environment FD overrides. */
  if (custody || fstat(0, &a) || fstat(1, &b) || !S_ISSOCK(a.st_mode) ||
      getsockopt(0, SOL_SOCKET, SO_TYPE, &type, &l) || type != SOCK_STREAM ||
      !S_ISREG(b.st_mode) || b.st_uid != getuid() || b.st_nlink != 1 ||
      (b.st_mode & 0777) != 0600)
    return fail(e, "custody_descriptors_invalid");
  if (fcntl(0, F_SETFD, FD_CLOEXEC) || fcntl(1, F_SETFD, FD_CLOEXEC))
    return fail(e, "cloexec_failed");
  custody = 1;
  return undef(e);
}
/* SDK imports may materialize process.stdin/stdout. Move custody off stdio
 * first, replace both with inert /dev/null, and return only the private channel
 * to the driver. */
static napi_value detach_channel(napi_env e, napi_callback_info info) {
  (void)info;
  if (custody != 1 || detached)
    return fail(e, "invalid_detach_phase");
  int channel = fcntl(0, F_DUPFD_CLOEXEC, 3),
      lock = fcntl(1, F_DUPFD_CLOEXEC, 3);
  int nullfd = open("/dev/null", O_RDWR | O_CLOEXEC);
  if (channel < 0 || lock < 0 || nullfd < 0)
    return fail(e, "custody_detach_failed");
  custody_fd = lock;
  detached = 1;
  if (dup3(nullfd, 0, O_CLOEXEC) < 0 || dup3(nullfd, 1, O_CLOEXEC) < 0)
    return fail(e, "custody_detach_failed");
  close(nullfd);
  napi_value v;
  napi_create_int32(e, channel, &v);
  return v;
}
static napi_value close_custody(napi_env e, napi_callback_info info) {
  (void)info;
  if (custody != 1)
    return fail(e, "invalid_custody_phase");
  /* No LOCK_UN operation exists for the inherited AK descriptor. */
  if (close(custody_fd))
    return fail(e, "custody_close_failed");
  custody = 2;
  return undef(e);
}
static napi_value init(napi_env e, napi_value exports) {
  napi_property_descriptor p[] = {
      {"openMutex", 0, open_mutex, 0, 0, 0, napi_default, 0},
      {"mutexIdentity", 0, identity, 0, 0, 0, napi_default, 0},
      {"tryLock", 0, try_lock, 0, 0, 0, napi_default, 0},
      {"unlockMutex", 0, unlock, 0, 0, 0, napi_default, 0},
      {"closeMutex", 0, close_mutex, 0, 0, 0, napi_default, 0},
      {"detachChannel", 0, detach_channel, 0, 0, 0, napi_default, 0},
      {"adoptCustody", 0, adopt, 0, 0, 0, napi_default, 0},
      {"closeCustody", 0, close_custody, 0, 0, 0, napi_default, 0}};
  napi_define_properties(e, exports, sizeof(p) / sizeof(p[0]), p);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
