#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
/// Encodes a record without truncation, including its newline in byteAllowance.
/// Private in-process Module; shared by the study and its policy tests.
FOUNDATION_EXPORT NSData * _Nullable EncodeNativeRecord(
  NSDictionary *record, NSUInteger byteAllowance, NSString * _Nullable __autoreleasing * _Nullable reason);
NS_ASSUME_NONNULL_END
