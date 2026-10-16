#import "NativeProvenance.h"
#import <objc/runtime.h>
#import <mach-o/loader.h>
#import <dlfcn.h>
#import <time.h>

NSTimeInterval NativeAdmissionClock(void) {
  struct timespec value;
  return clock_gettime(CLOCK_MONOTONIC_RAW, &value) == 0 ? value.tv_sec + value.tv_nsec / 1e9 : NAN;
}
NSDictionary *LoadedAddressProvenance(const void *address) {
  Dl_info info;
  if (!address || !dladdr(address, &info) || !info.dli_fbase) return nil;
  const struct mach_header_64 *header = info.dli_fbase;
  if (header->magic != MH_MAGIC_64 || header->sizeofcmds > 1024 * 1024) return nil;
  const uint8_t *cursor = (const uint8_t *)(header + 1), *end = cursor + header->sizeofcmds;
  for (uint32_t i = 0; i < header->ncmds && cursor + sizeof(struct load_command) <= end; i++) {
    const struct load_command *command = (const void *)cursor;
    if (command->cmdsize < sizeof(*command) || cursor + command->cmdsize > end) return nil;
    if (command->cmd == LC_UUID && command->cmdsize >= sizeof(struct uuid_command)) {
      NSString *name = [@(info.dli_fname ?: "") lastPathComponent];
      if ([name lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > 1024) return nil;
      NSString *uuid = [[NSUUID alloc] initWithUUIDBytes:((const struct uuid_command *)command)->uuid].UUIDString;
      return @{@"image":name, @"uuid":uuid, @"offset":@((uintptr_t)address - (uintptr_t)header)};
    }
    cursor += command->cmdsize;
  }
  return nil;
}
NSDictionary *LoadedPointProvenance(id session, id client) {
  Method method = class_getInstanceMethod(object_getClass(session), NSSelectorFromString(@"requestElementAtPoint:reply:"));
  NSDictionary *wrapper = LoadedAddressProvenance(method ? (const void *)method_getImplementation(method) : NULL);
  NSDictionary *sessionImage = LoadedAddressProvenance((__bridge const void *)object_getClass(session));
  Method validity = class_getInstanceMethod(object_getClass(client), NSSelectorFromString(@"attributesForElement:attributes:error:"));
  NSDictionary *ax = LoadedAddressProvenance(validity ? (const void *)method_getImplementation(validity) : NULL);
  Method getter = class_getClassMethod(object_getClass(session), NSSelectorFromString(@"sharedSession"));
  const char *types = getter ? method_getTypeEncoding(getter) : NULL;
  if (!types || strnlen(types, 1025) > 1024) return nil;
  return wrapper && sessionImage && ax ? @{@"wrapper":wrapper,@"session":sessionImage,@"accessibility":ax,
    @"sessionGetter":@{@"selector":@"sharedSession",@"encoding":@(types)}} : nil;
}
NSDictionary *BoundedExceptionProvenance(NSException *exception) {
  NSMutableDictionary *result = [@{@"reason":@"native-exception"} mutableCopy];
  for (NSString *key in @[@"name",@"reason"]) {
    NSString *value = [key isEqual:@"name"] ? exception.name : exception.reason;
    NSUInteger bytes = [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding];
    if (bytes <= 1024) result[[key isEqual:@"name"] ? @"exceptionName" : @"exceptionReason"] = value ?: @"";
    else { result[@"provenanceLimit"] = @YES; result[[key stringByAppendingString:@"Bytes"]] = @(bytes); }
  }
  NSArray *addresses = exception.callStackReturnAddresses;
  NSMutableArray *frames = [NSMutableArray array];
  for (NSNumber *address in [addresses subarrayWithRange:NSMakeRange(0, MIN(addresses.count, 16))]) {
    NSDictionary *image = LoadedAddressProvenance((const void *)address.unsignedLongLongValue);
    [frames addObject:image ?: @{@"unavailable":@YES}];
  }
  result[@"frames"] = frames;
  if (addresses.count > 16) { result[@"provenanceLimit"] = @YES; result[@"frameCount"] = @(addresses.count); }
  return result;
}

NSDictionary *LoadedMethodProvenance(id target, SEL selector) {
  Method method = class_getInstanceMethod(object_getClass(target), selector);
  const char *encoding = method ? method_getTypeEncoding(method) : NULL;
  if (!encoding || strnlen(encoding,1025) > 1024) return nil;
  NSDictionary *image = LoadedAddressProvenance((const void *)method_getImplementation(method));
  return image ? @{@"selector":NSStringFromSelector(selector),@"encoding":@(encoding),@"loadedImage":image} : nil;
}
