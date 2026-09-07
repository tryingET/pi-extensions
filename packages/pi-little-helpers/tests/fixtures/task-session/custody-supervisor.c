#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
/* Synthetic fixture only: no AK, DB, canonical lock or live process access. */
int main(int argc, char **argv) {
  if (argc != 5)
    return 2;
  int fd = open(argv[1], O_RDWR | O_CLOEXEC | O_NOFOLLOW), s[2];
  if (fd < 0 || socketpair(AF_UNIX, SOCK_STREAM, 0, s) || flock(fd, LOCK_EX))
    return 3;
  pid_t pid = fork();
  if (pid < 0)
    return 4;
  if (pid == 0) {
    if (dup2(s[1], 0) < 0 || dup2(fd, 1) < 0)
      _exit(5);
    close(s[0]);
    close(s[1]);
    close(fd);
    execl(argv[2], argv[2], argv[3], argv[4], NULL);
    _exit(6);
  }
  close(s[1]);
  close(fd);
  /* Wait until host adopted actual same OFD, then simulate supervisor death, no
   * LOCK_UN. */
  char byte;
  if (read(s[0], &byte, 1) != 1)
    return 7;
  printf("%ld\n", (long)pid);
  fflush(stdout);
  close(s[0]);
  return 0;
}
