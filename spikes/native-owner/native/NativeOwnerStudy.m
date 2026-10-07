#import <XCTest/XCTest.h>
#import <XCUIAutomation/XCUIAutomation.h>
#import "ObservationStudy.h"

@interface NativeOwnerStudy : XCTestCase
@end
@implementation NativeOwnerStudy
+ (void)tearDown {
  [super tearDown];
  printf("JEV_NATIVE_OWNER_CLASS_COMPLETED\n");
  fflush(stdout);
}
- (void)runPlan:(NSString *)expectedPlan {
  NSDictionary *environment = NSProcessInfo.processInfo.environment;
  NSString *requestID = environment[@"JEV_NATIVE_OWNER_REQUEST_ID"];
  NSString *plan = environment[@"JEV_NATIVE_OWNER_PLAN"];
  NSString *stopFile = environment[@"JEV_NATIVE_OWNER_STOP_FILE"];
  NSString *documents = environment[@"JEV_NATIVE_OWNER_FIXTURE_DOCUMENTS"];
  NSString *allowanceString = environment[@"JEV_NATIVE_OWNER_ADMISSION_SECONDS"];
  NSBundle *pluginBundle = [NSBundle bundleForClass:self.class];
  NSDictionary *info = pluginBundle.infoDictionary;
  NSString *fixtureID = info[@"JevNativeOwnerFixtureBundleIdentifier"];
  NSDictionary *expectedIdentity = @{
    @"plan":info[@"JevNativeOwnerPlan"] ?: @"",
    @"plugin":info[@"JevNativeOwnerPluginBundleIdentifier"] ?: @"",
    @"runner":info[@"JevNativeOwnerRunnerBundleIdentifier"] ?: @"",
    @"fixture":fixtureID ?: @""};
  NSDictionary *actualIdentity = @{@"plan":plan ?: @"",
    @"plugin":pluginBundle.bundleIdentifier ?: @"",
    @"runner":NSBundle.mainBundle.bundleIdentifier ?: @"", @"fixture":fixtureID ?: @""};
  BOOL validIdentity = [actualIdentity isEqualToDictionary:expectedIdentity];
  for (id value in expectedIdentity.allValues)
    validIdentity = validIdentity && [value isKindOfClass:NSString.class] && [value length] > 0
      && [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding] <= 1024;
  double allowance = 0;
  NSScanner *scanner = [NSScanner scannerWithString:allowanceString ?: @""];
  BOOL validAllowance = [scanner scanDouble:&allowance] && scanner.isAtEnd
    && isfinite(allowance) && allowance > 0;
  BOOL valid = [requestID isKindOfClass:NSString.class] && requestID.length > 0 && requestID.length <= 128
    && [plan isEqualToString:expectedPlan] && stopFile.isAbsolutePath && validAllowance
    && (![plan isEqualToString:@"reference-study"] || documents.isAbsolutePath) && validIdentity;
  XCTAssertTrue(valid, @"Missing or incompatible explicit study environment");
  if (!valid) return; // The host retains ownership when it receives no complete stream.
  ObservationStudy *study = [[ObservationStudy alloc]
    initWithDevice:XCUIDevice.sharedDevice
    configuration:@{@"requestId": requestID, @"plan": plan, @"allowance": @(allowance),
                    @"studyIdentity":actualIdentity, @"expectedStudyIdentity":expectedIdentity}
    clock:^{ return NSProcessInfo.processInfo.systemUptime; }
    stop:^{ return [NSFileManager.defaultManager fileExistsAtPath:stopFile]; }
    readFixture:^NSDictionary *{
      NSString *path = [documents stringByAppendingPathComponent:@"result.txt"];
      NSFileHandle *file = [NSFileHandle fileHandleForReadingFromURL:[NSURL fileURLWithPath:path] error:nil];
      if (file == nil) return (NSDictionary *)nil;
      NSData *data = [file readDataUpToLength:1025 error:nil];
      [file closeAndReturnError:nil];
      if (data == nil || data.length > 1024) return (NSDictionary *)nil;
      id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      return [value isKindOfClass:NSDictionary.class] ? value : (NSDictionary *)nil;
    }
    activateFixture:^{
      @try {
        XCUIApplication *fixture = [[XCUIApplication alloc] initWithBundleIdentifier:fixtureID];
        [fixture activate];
        return YES;
      } @catch (NSException *exception) { return NO; }
    }
    wait:^(NSTimeInterval seconds) { [NSThread sleepForTimeInterval:seconds]; }
    emit:^(NSDictionary *record) {
      NSError *error = nil;
      NSData *data = [NSJSONSerialization dataWithJSONObject:record options:0 error:&error];
      XCTAssertNil(error); XCTAssertNotNil(data);
      if (data != nil) {
        NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        printf("JEV_NATIVE_OWNER_V1 %s\n", json.UTF8String); fflush(stdout);
      }
    }];
  [study run];
}
- (void)testMetadataOnly { [self runPlan:@"metadata"]; }
- (void)testReferenceStudy { [self runPlan:@"reference-study"]; }
@end
