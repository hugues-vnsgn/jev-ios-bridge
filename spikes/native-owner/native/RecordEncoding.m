#import "RecordEncoding.h"

static BOOL BoundedStrings(id value) {
  if ([value isKindOfClass:NSString.class])
    return [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding] <= 1024;
  if ([value isKindOfClass:NSDictionary.class]) {
    for (id key in value) if (!BoundedStrings(key) || !BoundedStrings(value[key])) return NO;
  } else if ([value isKindOfClass:NSArray.class]) {
    for (id item in value) if (!BoundedStrings(item)) return NO;
  }
  return YES;
}

NSData *EncodeNativeRecord(NSDictionary *record, NSUInteger byteAllowance, NSString *__autoreleasing *reason) {
  NSString *failure = nil;
  NSData *data = nil;
  if (!BoundedStrings(record)) failure = @"string-limit";
  else {
    data = [NSJSONSerialization dataWithJSONObject:record options:0 error:nil];
    if (data == nil) failure = @"invalid-json";
    else if (data.length + 1 > MIN(byteAllowance, 1024u * 1024u)) failure = @"stream-limit";
  }
  if (reason != nil) *reason = failure;
  return failure == nil ? data : nil;
}
