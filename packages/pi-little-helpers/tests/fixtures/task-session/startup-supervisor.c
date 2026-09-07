#include <arpa/inet.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
static int all(int fd, void *b, size_t n, int writing) {
  char *p = b;
  while (n) {
    ssize_t k = writing ? write(fd, p, n) : read(fd, p, n);
    if (k <= 0)
      return -1;
    p += k;
    n -= k;
  }
  return 0;
}
/* Unpublished synthetic fixture: forwards frames; native authorization is NOT
 * implemented here. */
int main(int argc, char **argv) {
  if (argc != 5)
    return 2;
  int lock = open(argv[1], O_RDWR), s[2];
  if (lock < 0 || flock(lock, LOCK_EX) ||
      socketpair(AF_UNIX, SOCK_STREAM, 0, s))
    return 3;
  pid_t child = fork();
  if (child < 0)
    return 4;
  if (!child) {
    close(s[0]);
    if (dup2(s[1], 0) < 0 || dup2(lock, 1) < 0)
      return 5;
    close(s[1]);
    close(lock);
    execl(argv[2], argv[2], argv[3], argv[4], NULL);
    return 6;
  }
  close(s[1]);
  for (;;) {
    fd_set f;
    FD_ZERO(&f);
    FD_SET(0, &f);
    FD_SET(s[0], &f);
    if (select(s[0] + 1, &f, NULL, NULL, NULL) < 0)
      return 7;
    for (int i = 0; i < 2; i++) {
      int from = i ? s[0] : 0, to = i ? 1 : s[0];
      if (!FD_ISSET(from, &f))
        continue;
      uint32_t be;
      if (all(from, &be, 4, 0))
        return 0;
      size_t n = ntohl(be);
      if (!n || n > 1048576)
        return 8;
      char *b = calloc(n + 1, 1);
      if (!b || all(from, b, n, 0))
        return 9;
      /* Test controller independently compares durable T1 before sending this
       * frame. */
      int closed = !i && strstr(b, "\"kind\":\"CLOSED\"") != NULL;
      if (closed && flock(lock, LOCK_UN))
        return 10;
      if (all(to, &be, 4, 1) || all(to, b, n, 1))
        return 11;
      free(b);
      if (closed)
        return 0;
    }
  }
}
