#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import "ReferenceAccess.h"

NS_ASSUME_NONNULL_BEGIN

/// Private study Interface shared by the standalone runner and policy tests.
/// Results are raw observations. No result certifies native settlement.
@interface ObservationStudy : NSObject
- (instancetype)initWithDevice:(id)device
                 pointSession:(id (^)(void))pointSession
               pointProvenance:(nullable NSDictionary * (^)(id, id))pointProvenance
                 referenceAccess:(ReferenceAccess *)referenceAccess
                 configuration:(NSDictionary *)configuration
                         clock:(NSTimeInterval (^)(void))clock
                          stop:(BOOL (^)(void))stop
                   readFixture:(nullable NSDictionary * (^)(void))readFixture
               activateFixture:(BOOL (^)(void))activateFixture
                          wait:(void (^)(NSTimeInterval))wait
                          emit:(void (^)(NSDictionary *))emit;
- (void)run;
@end

NS_ASSUME_NONNULL_END
