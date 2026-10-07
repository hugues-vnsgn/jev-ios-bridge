#import <Foundation/Foundation.h>
NSDictionary *LoadedPointProvenance(id session, id client);
NSDictionary *BoundedExceptionProvenance(NSException *exception);
NSTimeInterval NativeAdmissionClock(void);

NSDictionary *LoadedAddressProvenance(const void *address);
NSDictionary *LoadedMethodProvenance(id target, SEL selector);
